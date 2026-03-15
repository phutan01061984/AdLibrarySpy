"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search, Plus, Download, RefreshCw, BarChart3, Table2, Eye, Hash,
  ChevronDown, ChevronRight, ExternalLink, Trash2, Settings, TrendingUp,
  Activity, Layers, Target, X, Check, AlertCircle, Upload, Filter
} from "lucide-react";

const API = "/api";

// ===== Types =====
interface Brand {
  id: string;
  name: string;
  pageId: string;
  adsCount: number;
  creativesCount: number;
  lastScraped: string | null;
}

interface Ad {
  libraryId: string;
  brandName: string;
  adCreationTime: string;
  adFormat: string;
  copyText: string;
  creativeId: string;
  creativeUrl: string;
  isActive: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  variantsCount?: number;
  thumbnailUrl?: string;
  callToAction?: string;
}

interface CreativeGroup {
  creativeId: string;
  brandName: string;
  variantsCount: number;
  ads: Ad[];
  isActive: boolean;
  creativeUrls: string[];
}

interface Analysis {
  brandId: string;
  brandName: string;
  totalAds: number;
  activeAds: number;
  inactiveAds: number;
  totalCreatives: number;
  activeCreatives: number;
  topCreatives: CreativeGroup[];
  formatDistribution: Record<string, number>;
  weeklyTrend: Record<string, number>;
  topWords: { word: string; count: number }[];
}

type ViewMode = "library" | "creative" | "weekly" | "byCount" | "analysis";

// ===== localStorage Helpers =====
const LS_BRANDS = "adspy_brands";
const LS_ADS_PREFIX = "adspy_ads_";

function lsGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}

function lsSet(key: string, value: any) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function lsGetBrands(): Brand[] {
  return lsGet<Brand[]>(LS_BRANDS, []);
}

function lsSaveBrands(brands: Brand[]) {
  lsSet(LS_BRANDS, brands);
}

function lsGetAds(brandId: string): Ad[] {
  return lsGet<Ad[]>(LS_ADS_PREFIX + brandId, []);
}

function lsSaveAds(brandId: string, ads: Ad[]) {
  lsSet(LS_ADS_PREFIX + brandId, ads);
}

function lsDeleteBrand(brandId: string) {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(LS_ADS_PREFIX + brandId); } catch {}
}

function buildPivotFromAds(ads: Ad[], groupBy: string, sortBy: string, sortOrder: string, filterActive: string, search: string) {
  let filtered = ads;
  if (filterActive === "active") filtered = filtered.filter(a => a.isActive);
  if (filterActive === "inactive") filtered = filtered.filter(a => !a.isActive);
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(a => a.copyText?.toLowerCase().includes(q) || a.libraryId?.includes(q) || a.brandName?.toLowerCase().includes(q));
  }

  if (groupBy === "none" || groupBy === "library") {
    // Return flat list
    return {
      groupBy: "none",
      rows: filtered,
      totalGroups: filtered.length,
      totalAds: filtered.length,
    };
  }

  // Group by creative
  const groups: Record<string, CreativeGroup> = {};
  for (const ad of filtered) {
    const key = ad.creativeId || ad.libraryId;
    if (!groups[key]) {
      groups[key] = {
        creativeId: key,
        brandName: ad.brandName,
        variantsCount: 0,
        ads: [],
        isActive: ad.isActive,
        creativeUrls: [],
      };
    }
    groups[key].ads.push(ad);
    groups[key].variantsCount = (ad.variantsCount || 1);
    if (ad.creativeUrl && !groups[key].creativeUrls.includes(ad.creativeUrl)) {
      groups[key].creativeUrls.push(ad.creativeUrl);
    }
  }

  let sorted = Object.values(groups);
  sorted.sort((a, b) => {
    const av = sortBy === "variantsCount" ? a.variantsCount : a.brandName;
    const bv = sortBy === "variantsCount" ? b.variantsCount : b.brandName;
    if (typeof av === "number" && typeof bv === "number") {
      return sortOrder === "desc" ? bv - av : av - bv;
    }
    return sortOrder === "desc" ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
  });

  return { groupBy: "creative", rows: sorted, totalGroups: sorted.length, totalAds: filtered.length };
}

function buildAnalysisFromAds(ads: Ad[], brandId: string, brandName: string): Analysis {
  const active = ads.filter(a => a.isActive);
  const inactive = ads.filter(a => !a.isActive);
  const creativeMap: Record<string, Ad[]> = {};
  for (const ad of ads) {
    const key = ad.creativeId || ad.libraryId;
    if (!creativeMap[key]) creativeMap[key] = [];
    creativeMap[key].push(ad);
  }

  const creativeGroups = Object.entries(creativeMap).map(([id, group]) => ({
    creativeId: id,
    brandName: group[0].brandName,
    variantsCount: group[0].variantsCount || group.length,
    ads: group,
    isActive: group.some(a => a.isActive),
    creativeUrls: group.map(a => a.creativeUrl).filter(Boolean),
  }));

  const formatDist: Record<string, number> = {};
  for (const ad of ads) {
    formatDist[ad.adFormat || "unknown"] = (formatDist[ad.adFormat || "unknown"] || 0) + 1;
  }

  const wordCount: Record<string, number> = {};
  for (const ad of ads) {
    const words = (ad.copyText || "").toLowerCase().split(/\W+/).filter(w => w.length > 3);
    for (const w of words) wordCount[w] = (wordCount[w] || 0) + 1;
  }
  const topWords = Object.entries(wordCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word, count]) => ({ word, count }));

  return {
    brandId, brandName,
    totalAds: ads.length,
    activeAds: active.length,
    inactiveAds: inactive.length,
    totalCreatives: creativeGroups.length,
    activeCreatives: creativeGroups.filter(g => g.isActive).length,
    topCreatives: creativeGroups.sort((a, b) => b.variantsCount - a.variantsCount).slice(0, 10),
    formatDistribution: formatDist,
    weeklyTrend: {},
    topWords,
  };
}

// ===== Main Page =====
export default function DashboardPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("byCount");
  const [pivotData, setPivotData] = useState<any>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [hashing, setHashing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("variantsCount");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [filterActive, setFilterActive] = useState<string>("");
  const [showAddBrand, setShowAddBrand] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");
  const [newBrandPageId, setNewBrandPageId] = useState("");
  const [importJson, setImportJson] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [settingsToken, setSettingsToken] = useState("");
  const [settingsCountry, setSettingsCountry] = useState("VN");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Load brands from localStorage
  useEffect(() => {
    loadBrands();
  }, []);

  // Load data when brand or view changes
  useEffect(() => {
    if (selectedBrand) {
      if (viewMode === "analysis") {
        loadAnalysis(selectedBrand);
      } else {
        loadPivotData(selectedBrand);
      }
    }
  }, [selectedBrand, viewMode, sortBy, sortOrder, filterActive, searchQuery]);

  function loadBrands() {
    const data = lsGetBrands();
    setBrands(data);
    if (data.length > 0 && !selectedBrand) {
      setSelectedBrand(data[0].id);
    }
  }

  // Alias for compatibility
  const fetchBrands = loadBrands;

  function loadPivotData(brandId: string) {
    setLoading(true);
    const ads = lsGetAds(brandId);
    const groupBy = viewMode === "creative" || viewMode === "byCount" ? "creative"
      : viewMode === "weekly" ? "week"
      : "none";
    const data = buildPivotFromAds(ads, groupBy, sortBy, sortOrder, filterActive, searchQuery);
    setPivotData(data);
    setLoading(false);
  }

  // Alias for compatibility
  const fetchPivotData = loadPivotData;

  function loadAnalysis(brandId: string) {
    setLoading(true);
    const ads = lsGetAds(brandId);
    const brand = brands.find(b => b.id === brandId);
    const data = buildAnalysisFromAds(ads, brandId, brand?.name || brandId);
    setAnalysis(data);
    setLoading(false);
  }

  // Alias for compatibility
  const fetchAnalysis = loadAnalysis;

  async function handleScrape() {
    if (!selectedBrand) return;
    setScraping(true);
    try {
      const brand = brands.find(b => b.id === selectedBrand);
      const res = await fetch(`${API}/scrape/${selectedBrand}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "web", searchTerm: brand?.name }),
      });
      const data = await res.json();
      if (res.ok) {
        // Save ads to localStorage
        const existingAds = lsGetAds(selectedBrand);
        const newAds: Ad[] = (data.ads || []).map((ad: any) => ({
          libraryId: ad.libraryId,
          brandName: ad.brandName || brand?.name || selectedBrand,
          adCreationTime: ad.adCreationTime || new Date().toISOString(),
          adFormat: ad.adFormat || "unknown",
          copyText: ad.copyText || "",
          creativeId: ad.creativeId || ad.libraryId,
          creativeUrl: ad.creativeUrl || "",
          isActive: ad.isActive ?? true,
          firstSeenAt: ad.firstSeenAt || new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
          variantsCount: ad.variantsCount || 1,
          thumbnailUrl: ad.thumbnailUrl || null,
          callToAction: ad.callToAction || "",
        }));
        // Merge: update existing, add new
        const existingMap = new Map(existingAds.map(a => [a.libraryId, a]));
        for (const ad of newAds) {
          existingMap.set(ad.libraryId, { ...existingMap.get(ad.libraryId), ...ad });
        }
        const mergedAds = Array.from(existingMap.values());
        lsSaveAds(selectedBrand, mergedAds);
        
        // Update brand info
        const updatedBrands = brands.map(b => 
          b.id === selectedBrand ? { ...b, adsCount: mergedAds.length, lastScraped: new Date().toISOString() } : b
        );
        lsSaveBrands(updatedBrands);
        setBrands(updatedBrands);
        
        showToast(`Scraped ${data.count} ads via ${data.method || "web"} scraping`, "success");
        loadPivotData(selectedBrand);
      } else {
        showToast(data.error || "Scraping failed", "error");
      }
    } catch (e: any) {
      showToast(e.message, "error");
    }
    setScraping(false);
  }

  async function handleHash() {
    if (!selectedBrand) return;
    setHashing(true);
    try {
      const res = await fetch(`${API}/hash/${selectedBrand}`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        showToast(`Hashed ${data.hashed} thumbnails (${data.failed} failed)`, "success");
        fetchPivotData(selectedBrand);
      } else {
        showToast(data.error, "error");
      }
    } catch (e: any) {
      showToast(e.message, "error");
    }
    setHashing(false);
  }

  function handleAddBrand() {
    if (!newBrandName.trim()) return;
    const brandId = newBrandName.trim().toLowerCase().replace(/\s+/g, "-");
    const existing = lsGetBrands();
    if (existing.find(b => b.id === brandId)) {
      showToast("Brand already exists", "error");
      return;
    }
    const newBrand: Brand = {
      id: brandId,
      name: newBrandName.trim(),
      pageId: newBrandPageId || "",
      adsCount: 0,
      creativesCount: 0,
      lastScraped: null,
    };
    const updated = [...existing, newBrand];
    lsSaveBrands(updated);
    setBrands(updated);
    showToast(`Added brand: ${newBrand.name}`, "success");
    setShowAddBrand(false);
    setNewBrandName("");
    setNewBrandPageId("");
    setSelectedBrand(brandId);
  }

  function handleDeleteBrand(id: string) {
    if (!confirm(`Delete brand "${id}" and all its data?`)) return;
    lsDeleteBrand(id);
    const updated = lsGetBrands().filter(b => b.id !== id);
    lsSaveBrands(updated);
    setBrands(updated);
    showToast("Brand deleted", "success");
    if (selectedBrand === id) setSelectedBrand(null);
  }

  function handleImport() {
    if (!selectedBrand || !importJson.trim()) return;
    try {
      const parsed = JSON.parse(importJson);
      const adsArr = Array.isArray(parsed) ? parsed : [parsed];
      const existing = lsGetAds(selectedBrand);
      const existingMap = new Map(existing.map(a => [a.libraryId, a]));
      for (const ad of adsArr) {
        const id = ad.libraryId || ad.id || `import-${Date.now()}-${Math.random()}`;
        existingMap.set(id, { ...ad, libraryId: id });
      }
      const merged = Array.from(existingMap.values());
      lsSaveAds(selectedBrand, merged);
      const updatedBrands = brands.map(b =>
        b.id === selectedBrand ? { ...b, adsCount: merged.length } : b
      );
      lsSaveBrands(updatedBrands);
      setBrands(updatedBrands);
      showToast(`Imported ${adsArr.length} ads`, "success");
      setShowImport(false);
      setImportJson("");
      loadPivotData(selectedBrand);
    } catch (e) {
      showToast("Invalid JSON format", "error");
    }
  }

  async function handleSaveSettings() {
    try {
      await fetch(`${API}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facebookAccessToken: settingsToken,
          defaultCountry: settingsCountry,
        }),
      });
      showToast("Settings saved", "success");
      setShowSettings(false);
    } catch (e) {
      showToast("Failed to save", "error");
    }
  }

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  function toggleGroup(id: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const views: { key: ViewMode; label: string; icon: any }[] = [
    { key: "library", label: "Library ID by Brand", icon: Table2 },
    { key: "creative", label: "Creative ID by Brand", icon: Layers },
    { key: "weekly", label: "Creative ID by Week", icon: TrendingUp },
    { key: "byCount", label: "Creative By # of Ads", icon: BarChart3 },
    { key: "analysis", label: "Analysis Dashboard", icon: Activity },
  ];

  const currentBrand = brands.find(b => b.id === selectedBrand);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* === Sidebar === */}
      <div className="sidebar flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Eye className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-bold">AdLibrarySpy</h1>
              <p className="text-[10px] text-muted-foreground">Meta Ad Intelligence</p>
            </div>
          </div>
        </div>

        {/* Brands list */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Brands</span>
            <button
              onClick={() => setShowAddBrand(true)}
              className="w-5 h-5 rounded flex items-center justify-center hover:bg-secondary transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {brands.length === 0 ? (
            <div className="text-center py-6">
              <Target className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-40" />
              <p className="text-xs text-muted-foreground">No brands tracked</p>
              <button
                onClick={() => setShowAddBrand(true)}
                className="mt-2 text-xs text-primary hover:underline"
              >
                + Add your first brand
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              {brands.map(brand => (
                <div
                  key={brand.id}
                  onClick={() => setSelectedBrand(brand.id)}
                  className={`group flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-all ${
                    selectedBrand === brand.id
                      ? "bg-primary/10 border border-primary/20"
                      : "hover:bg-secondary/50"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{brand.name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">{brand.adsCount} ads</span>
                      <span className="text-[10px] text-muted-foreground">·</span>
                      <span className="text-[10px] text-muted-foreground">{brand.creativesCount} creatives</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteBrand(brand.id); }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/20 transition-all"
                  >
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom actions */}
        <div className="p-3 border-t border-border">
          <button
            onClick={() => { fetchSettings(); setShowSettings(true); }}
            className="flex items-center gap-2 w-full p-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all"
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
        </div>
      </div>

      {/* === Main Content === */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="border-b border-border bg-card/50">
          {/* View Tabs */}
          <div className="flex items-center gap-0 px-4 pt-2">
            {views.map(v => {
              const Icon = v.icon;
              return (
                <button
                  key={v.key}
                  onClick={() => setViewMode(v.key)}
                  className={`view-tab flex items-center gap-1.5 ${viewMode === v.key ? "active" : ""}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {v.label}
                </button>
              );
            })}
          </div>

          {/* Action bar */}
          <div className="flex items-center gap-3 px-4 py-2.5">
            {/* Search */}
            <div className="flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-1.5 flex-1 max-w-sm border border-border focus-within:border-primary/30 transition-colors">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search ads, creatives, text..."
                className="bg-transparent text-sm outline-none w-full placeholder:text-muted-foreground/50"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")}>
                  <X className="w-3 h-3 text-muted-foreground" />
                </button>
              )}
            </div>

            {/* Filter */}
            <select
              className="text-xs bg-secondary rounded-lg px-3 py-1.5 border border-border outline-none"
              value={filterActive}
              onChange={e => setFilterActive(e.target.value)}
            >
              <option value="">All Status</option>
              <option value="true">Active Only</option>
              <option value="false">Inactive Only</option>
            </select>

            <div className="flex-1" />

            {/* Actions */}
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:bg-secondary/50 transition-colors"
              disabled={!selectedBrand}
            >
              <Upload className="w-3.5 h-3.5" />
              Import
            </button>
            <button
              onClick={handleHash}
              disabled={hashing || !selectedBrand}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:bg-secondary/50 transition-colors disabled:opacity-40"
            >
              <Hash className={`w-3.5 h-3.5 ${hashing ? "animate-spin" : ""}`} />
              {hashing ? "Hashing..." : "Hash Thumbnails"}
            </button>
            <button
              onClick={handleScrape}
              disabled={scraping || !selectedBrand}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scraping ? "animate-spin" : ""}`} />
              {scraping ? "Scraping..." : "Scrape Web"}
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-4">
          {!selectedBrand ? (
            <EmptyState />
          ) : loading ? (
            <LoadingShimmer />
          ) : viewMode === "analysis" ? (
            analysis ? <AnalysisDashboard analysis={analysis} /> : null
          ) : pivotData ? (
            <PivotTableView
              data={pivotData}
              viewMode={viewMode}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={(col) => {
                if (sortBy === col) setSortOrder(prev => prev === "asc" ? "desc" : "asc");
                else { setSortBy(col); setSortOrder("desc"); }
              }}
              expandedGroups={expandedGroups}
              onToggleGroup={toggleGroup}
              brandName={currentBrand?.name || ""}
            />
          ) : null}
        </div>
      </div>

      {/* === Modals === */}
      {showAddBrand && (
        <Modal title="Add Brand to Track" onClose={() => setShowAddBrand(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1 text-muted-foreground">Brand Name *</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-secondary rounded-lg border border-border outline-none focus:border-primary/30 text-sm"
                placeholder="e.g., ILAVietnam"
                value={newBrandName}
                onChange={e => setNewBrandName(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-muted-foreground">Facebook Page ID</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-secondary rounded-lg border border-border outline-none focus:border-primary/30 text-sm"
                placeholder="e.g., 123456789"
                value={newBrandPageId}
                onChange={e => setNewBrandPageId(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Find Page ID: facebook.com/your-page → About → Page Transparency
              </p>
            </div>
            <button
              onClick={handleAddBrand}
              disabled={!newBrandName.trim()}
              className="w-full py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-40 transition-colors"
            >
              Add Brand
            </button>
          </div>
        </Modal>
      )}

      {showImport && (
        <Modal title={`Import Ads → ${selectedBrand}`} onClose={() => setShowImport(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1 text-muted-foreground">Paste JSON Array</label>
              <textarea
                className="w-full h-48 px-3 py-2 bg-secondary rounded-lg border border-border outline-none focus:border-primary/30 text-xs font-mono"
                placeholder={`[\n  {\n    "library_id": "795880936312750",\n    "brand_name": "ILAVietnam",\n    "creative_id": "ILAVietnam-fffec0",\n    "creative_url": "https://www.facebook.com/ads/library/?id=795880936312750",\n    "is_active": true,\n    "copy_text": "Khóa hè 2026..."\n  }\n]`}
                value={importJson}
                onChange={e => setImportJson(e.target.value)}
              />
            </div>
            <button
              onClick={handleImport}
              disabled={!importJson.trim()}
              className="w-full py-2 rounded-lg bg-accent text-accent-foreground font-medium text-sm hover:bg-accent/90 disabled:opacity-40 transition-colors"
            >
              <Upload className="w-4 h-4 inline mr-1" /> Import Data
            </button>
          </div>
        </Modal>
      )}

      {showSettings && (
        <Modal title="Settings" onClose={() => setShowSettings(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1 text-muted-foreground">Facebook Access Token</label>
              <input
                type="password"
                className="w-full px-3 py-2 bg-secondary rounded-lg border border-border outline-none focus:border-primary/30 text-sm font-mono"
                placeholder="EAAx..."
                value={settingsToken}
                onChange={e => setSettingsToken(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Get token: developers.facebook.com → Your App → Tools → Access Token
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-muted-foreground">Default Country</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-secondary rounded-lg border border-border outline-none focus:border-primary/30 text-sm"
                placeholder="VN"
                value={settingsCountry}
                onChange={e => setSettingsCountry(e.target.value)}
              />
            </div>
            <button
              onClick={handleSaveSettings}
              className="w-full py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors"
            >
              Save Settings
            </button>
          </div>
        </Modal>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-xl transition-all animate-in slide-in-from-bottom-5 ${
          toast.type === "success"
            ? "bg-accent/90 text-accent-foreground"
            : "bg-destructive/90 text-destructive-foreground"
        }`}>
          {toast.type === "success" ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}
    </div>
  );

  async function fetchSettings() {
    try {
      const res = await fetch(`${API}/settings`);
      const data = await res.json();
      setSettingsToken(data.facebookAccessToken || "");
      setSettingsCountry(data.defaultCountry || "VN");
    } catch (e) {}
  }
}

// ===== Pivot Table Component =====
function PivotTableView({
  data, viewMode, sortBy, sortOrder, onSort, expandedGroups, onToggleGroup, brandName
}: {
  data: any;
  viewMode: ViewMode;
  sortBy: string;
  sortOrder: string;
  onSort: (col: string) => void;
  expandedGroups: Set<string>;
  onToggleGroup: (id: string) => void;
  brandName: string;
}) {
  if (data.groupBy === "creative") {
    const rows = data.rows as CreativeGroup[];
    const maxVariants = Math.max(...rows.map(r => r.variantsCount), 1);

    return (
      <div className="glass-card overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-200px)]">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>brand_name</th>
                <th className={sortBy === "creativeId" ? "sorted" : ""} onClick={() => onSort("creativeId")}>
                  creative_id {sortBy === "creativeId" && (sortOrder === "desc" ? "↓" : "↑")}
                </th>
                <th className={sortBy === "variantsCount" ? "sorted" : ""} onClick={() => onSort("variantsCount")} style={{ width: 120 }}>
                  variants_count {sortBy === "variantsCount" && (sortOrder === "desc" ? "↓" : "↑")}
                </th>
                <th>creative_url</th>
                <th>is_active</th>
                <th style={{ width: 150 }}>popularity</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((group, gi) => {
                const isExpanded = expandedGroups.has(group.creativeId);
                const isWin = group.variantsCount >= 10;
                return (
                  <>
                    <tr
                      key={group.creativeId}
                      className={`cursor-pointer ${isWin ? "glow-win" : ""}`}
                      onClick={() => onToggleGroup(group.creativeId)}
                    >
                      <td>
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </td>
                      <td className="font-medium">{brandName}</td>
                      <td>
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-secondary">
                          {group.creativeId}
                        </span>
                      </td>
                      <td>
                        <span className={`font-bold text-base ${isWin ? "text-amber-400" : ""}`}>
                          {group.variantsCount}
                        </span>
                        {isWin && <span className="badge badge-win ml-2">🏆 WIN</span>}
                      </td>
                      <td className="text-xs text-muted-foreground">
                        {group.ads.length > 0 && (
                          <span>{group.ads.length} ads</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${group.isActive ? "badge-active" : "badge-inactive"}`}>
                          {group.isActive ? "active" : "inactive"}
                        </span>
                      </td>
                      <td>
                        <div className="variant-bar">
                          <div
                            className="variant-bar-fill"
                            style={{ width: `${(group.variantsCount / maxVariants) * 100}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (group.ads as any[]).map((ad: any, ai: number) => (
                      <tr key={`${group.creativeId}-${ai}`} className="bg-secondary/20">
                        <td></td>
                        <td className="text-xs text-muted-foreground pl-6">{brandName}</td>
                        <td className="text-xs text-muted-foreground font-mono">{group.creativeId}</td>
                        <td></td>
                        <td>
                          {ad.creativeUrl ? (
                            <a
                              href={ad.creativeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                              onClick={e => e.stopPropagation()}
                            >
                              {ad.creativeUrl.length > 60 ? ad.creativeUrl.substring(0, 60) + '...' : ad.creativeUrl}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${ad.isActive ? "badge-active" : "badge-inactive"}`}>
                            {ad.isActive ? "true" : "false"}
                          </span>
                        </td>
                        <td></td>
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
          {data.totalGroups} creative groups · {data.totalAds} total ads
        </div>
      </div>
    );
  }

  if (data.groupBy === "week") {
    return (
      <div className="glass-card overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-200px)]">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>week</th>
                <th>ads_count</th>
                <th>details</th>
              </tr>
            </thead>
            <tbody>
              {(data.rows || []).map((group: any) => {
                const isExpanded = expandedGroups.has(group.week);
                return (
                  <>
                    <tr key={group.week} className="cursor-pointer" onClick={() => onToggleGroup(group.week)}>
                      <td>
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </td>
                      <td className="font-medium font-mono">{group.week}</td>
                      <td className="font-bold">{group.count}</td>
                      <td className="text-xs text-muted-foreground">Click to expand</td>
                    </tr>
                    {isExpanded && (group.ads || []).map((ad: any, ai: number) => (
                      <tr key={`${group.week}-${ai}`} className="bg-secondary/20">
                        <td></td>
                        <td className="text-xs text-muted-foreground font-mono">{ad.adCreationTime?.substring(0, 10) || "—"}</td>
                        <td className="text-xs">
                          <span className="font-mono bg-secondary px-1.5 py-0.5 rounded">{ad.creativeId || "unhashed"}</span>
                        </td>
                        <td>
                          {ad.creativeUrl ? (
                            <a href={ad.creativeUrl} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                              onClick={e => e.stopPropagation()}>
                              View <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : "—"}
                        </td>
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Flat list (library view)
  return (
    <div className="glass-card overflow-hidden">
      <div className="overflow-auto max-h-[calc(100vh-200px)]">
        <table className="data-table">
          <thead>
            <tr>
              <th onClick={() => onSort("libraryId")}>library_id</th>
              <th>brand_name</th>
              <th onClick={() => onSort("creativeId")}>creative_id</th>
              <th onClick={() => onSort("adCreationTime")}>ad_creation_time</th>
              <th>copy_text</th>
              <th>creative_url</th>
              <th onClick={() => onSort("isActive")}>is_active</th>
            </tr>
          </thead>
          <tbody>
            {(data.rows || []).map((ad: any) => (
              <tr key={ad.libraryId}>
                <td className="font-mono text-xs">{ad.libraryId}</td>
                <td>{ad.brandName || brandName}</td>
                <td>
                  <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-secondary">
                    {ad.creativeId || "—"}
                  </span>
                </td>
                <td className="text-xs text-muted-foreground">{ad.adCreationTime?.substring(0, 10) || "—"}</td>
                <td className="text-xs max-w-[200px] truncate" title={ad.copyText}>{ad.copyText || "—"}</td>
                <td>
                  {ad.creativeUrl ? (
                    <a href={ad.creativeUrl} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                      View <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : "—"}
                </td>
                <td>
                  <span className={`badge ${ad.isActive ? "badge-active" : "badge-inactive"}`}>
                    {ad.isActive ? "true" : "false"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
        Page {data.page} of {data.totalPages} · {data.total} total ads
      </div>
    </div>
  );
}

// ===== Analysis Dashboard =====
function AnalysisDashboard({ analysis }: { analysis: Analysis }) {
  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Ads" value={analysis.totalAds} icon={<Layers className="w-5 h-5" />} />
        <StatCard label="Active Ads" value={analysis.activeAds} icon={<Activity className="w-5 h-5" />} color="accent" />
        <StatCard label="Unique Creatives" value={analysis.totalCreatives} icon={<Hash className="w-5 h-5" />} color="primary" />
        <StatCard label="Active Creatives" value={analysis.activeCreatives} icon={<Target className="w-5 h-5" />} color="chart3" />
      </div>

      {/* Top Creatives (Win Detection) */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          Top Winning Creatives
          <span className="text-xs text-muted-foreground font-normal">(by variant count = times duplicated)</span>
        </h3>
        <div className="space-y-2">
          {(analysis.topCreatives || []).map((creative, i) => {
            const maxV = analysis.topCreatives[0]?.variantsCount || 1;
            return (
              <div key={i} className={`flex items-center gap-3 p-2.5 rounded-lg ${i < 3 ? "bg-accent/5 border border-accent/10" : "bg-secondary/30"}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  i === 0 ? "bg-amber-500/20 text-amber-400" :
                  i === 1 ? "bg-gray-400/20 text-gray-300" :
                  i === 2 ? "bg-amber-700/20 text-amber-600" :
                  "bg-secondary text-muted-foreground"
                }`}>
                  {i + 1}
                </span>
                <span className="font-mono text-xs bg-secondary px-2 py-0.5 rounded min-w-[140px]">
                  {creative.creativeId}
                </span>
                <div className="flex-1">
                  <div className="variant-bar" style={{ height: 8 }}>
                    <div
                      className="variant-bar-fill"
                      style={{ width: `${(creative.variantsCount / maxV) * 100}%` }}
                    />
                  </div>
                </div>
                <span className="text-sm font-bold min-w-[40px] text-right">{creative.variantsCount}</span>
                <span className={`badge ${creative.isActive ? "badge-active" : "badge-inactive"}`}>
                  {creative.isActive ? "active" : "off"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Format & Weekly Trend */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Format Distribution */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Filter className="w-4 h-4 text-primary" />
            Ad Format Distribution
          </h3>
          <div className="space-y-2">
            {Object.entries(analysis.formatDistribution || {}).map(([format, count]) => (
              <div key={format} className="flex items-center justify-between text-sm">
                <span className="capitalize">{format}</span>
                <span className="font-mono text-muted-foreground">{count as number}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Weekly Trend */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Weekly Ad Volume
          </h3>
          <div className="space-y-1.5">
            {Object.entries(analysis.weeklyTrend || {})
              .sort((a, b) => b[0].localeCompare(a[0]))
              .slice(0, 8)
              .map(([week, count]) => {
                const maxWeek = Math.max(...Object.values(analysis.weeklyTrend || {}));
                return (
                  <div key={week} className="flex items-center gap-2 text-xs">
                    <span className="font-mono w-20">{week}</span>
                    <div className="flex-1 variant-bar">
                      <div className="variant-bar-fill" style={{ width: `${((count as number) / maxWeek) * 100}%` }} />
                    </div>
                    <span className="font-mono w-8 text-right text-muted-foreground">{count as number}</span>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* Top Keywords */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-3">🔤 Top Keywords in Ad Copy</h3>
        <div className="flex flex-wrap gap-2">
          {(analysis.topWords || []).map(({ word, count }) => (
            <span key={word} className="field-pill">
              {word} <span className="text-muted-foreground">({count})</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ===== UI Components =====

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color?: string }) {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className="stat-value">{value.toLocaleString()}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="glass-card p-6 w-full max-w-md shadow-2xl animate-in zoom-in-95"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-secondary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-4">
        <Eye className="w-8 h-8 text-primary/60" />
      </div>
      <h2 className="text-xl font-semibold mb-2">Welcome to AdLibrarySpy</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        Add a brand to start tracking their Meta Ad Library data.
        Scrape ads, hash thumbnails, and analyze competitive strategies.
      </p>
    </div>
  );
}

function LoadingShimmer() {
  return (
    <div className="space-y-3">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="shimmer h-12 rounded-lg" />
      ))}
    </div>
  );
}
