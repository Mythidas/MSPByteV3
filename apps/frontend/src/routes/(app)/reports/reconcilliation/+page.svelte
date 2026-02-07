<script lang="ts">
  import { Button } from '$lib/components/ui/button/index.js';
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.js';
  import { Progress } from '$lib/components/ui/progress/index.js';
  import { Switch } from '$lib/components/ui/switch/index.js';
  import SearchBar from '$lib/components/search-bar.svelte';
  import SiteRow from './components/site-row.svelte';
  import {
    RefreshCw,
    Download,
    LoaderCircle,
    TriangleAlert,
    Building2,
    FileWarning,
    Clock,
  } from '@lucide/svelte';
  import type { ReconciliationReport } from './types';

  let isGenerating = $state(false);
  let error = $state<string | null>(null);
  let progress = $state({ current: 0, total: 0, siteName: '' });
  let reportData = $state<ReconciliationReport | null>(null);
  let filterIssuesOnly = $state(false);
  let expandedSites = $state<Set<string>>(new Set());
  let searchQuery = $state('');

  let progressPercentage = $derived(
    progress.total > 0 ? (progress.current / progress.total) * 100 : 0
  );

  let filteredSites = $derived.by(() => {
    if (!reportData) return [];

    let sites = reportData.sites;

    if (filterIssuesOnly) {
      sites = sites.filter((s) => s.status === 'issues' || s.status === 'error');
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      sites = sites.filter((s) => s.name.toLowerCase().includes(query));
    }

    return sites;
  });

  async function generateReport() {
    isGenerating = true;
    error = null;
    progress = { current: 0, total: 0, siteName: 'Initializing...' };
    reportData = null;
    expandedSites = new Set();

    try {
      const eventSource = new EventSource('/reports/reconcilliation');

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.error) {
          error = data.error;
          eventSource.close();
          isGenerating = false;
          return;
        }

        if (data.complete) {
          reportData = data.report;
          eventSource.close();
          isGenerating = false;
        } else {
          progress = {
            current: data.current,
            total: data.total,
            siteName: data.siteName,
          };
        }
      };

      eventSource.onerror = () => {
        error = 'Connection lost. Please try again.';
        eventSource.close();
        isGenerating = false;
      };
    } catch (err) {
      console.error('Error generating report:', err);
      error = 'Failed to generate report. Please try again.';
      isGenerating = false;
    }
  }

  async function exportToXlsx() {
    if (!reportData) return;

    try {
      const response = await fetch('/reports/reconcilliation/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reportData),
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reconciliation-report-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Export error:', err);
      error = 'Failed to export report';
    }
  }

  function toggleSite(siteId: string) {
    const newSet = new Set(expandedSites);
    if (newSet.has(siteId)) {
      newSet.delete(siteId);
    } else {
      newSet.add(siteId);
    }
    expandedSites = newSet;
  }

  function formatDate(isoString: string): string {
    return new Date(isoString).toLocaleString();
  }
</script>

<div class="flex flex-col size-full p-6 gap-6">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-semibold">Reconciliation Report</h1>
      <p class="text-muted-foreground text-sm">
        Compare contract units against actual device counts across integrations
      </p>
    </div>
    <div class="flex items-center gap-2">
      {#if reportData}
        <Button variant="outline" onclick={exportToXlsx}>
          <Download class="h-4 w-4 mr-2" />
          Export XLSX
        </Button>
      {/if}
      <Button onclick={generateReport} disabled={isGenerating}>
        {#if isGenerating}
          <LoaderCircle class="h-4 w-4 mr-2 animate-spin" />
          Generating...
        {:else}
          <RefreshCw class="h-4 w-4 mr-2" />
          Generate Report
        {/if}
      </Button>
    </div>
  </div>

  {#if error}
    <div class="rounded-lg bg-destructive/10 text-destructive p-4 text-sm flex items-center gap-2">
      <TriangleAlert class="h-4 w-4 shrink-0" />
      {error}
    </div>
  {/if}

  {#if isGenerating}
    <div class="flex-1 flex items-center justify-center">
      <Card class="max-w-md w-full bg-primary/5 border-primary/20">
        <CardHeader>
          <CardTitle class="text-sm font-medium flex items-center gap-2 text-primary">
            <LoaderCircle class="h-4 w-4 animate-spin" />
            Generating Report
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div class="space-y-3">
            <Progress value={progressPercentage} class="w-full h-2.5" />
            <div class="flex justify-between text-sm">
              <span class="text-foreground font-medium">
                Processing: {progress.current} of {progress.total} sites
              </span>
              <span class="text-primary font-semibold">
                {Math.round(progressPercentage)}%
              </span>
            </div>
            <p class="text-sm text-muted-foreground truncate">
              Current: {progress.siteName}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  {:else if reportData}
    <div class="grid grid-cols-4 gap-4">
      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Building2 class="h-4 w-4" />
            Total Sites
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div class="text-2xl font-bold">{reportData.summary.totalSites}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <FileWarning class="h-4 w-4" />
            Sites with Issues
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div class="text-2xl font-bold text-orange-600">
            {reportData.summary.sitesWithIssues}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <TriangleAlert class="h-4 w-4" />
            Total Mismatches
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div class="text-2xl font-bold text-red-600">
            {reportData.summary.totalMismatches}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Clock class="h-4 w-4" />
            Generated
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div class="text-sm font-medium">{formatDate(reportData.generatedAt)}</div>
        </CardContent>
      </Card>
    </div>

    <div class="flex items-center gap-4">
      <div class="flex-1 max-w-sm">
        <SearchBar bind:value={searchQuery} placeholder="Search sites..." />
      </div>
      <div class="flex items-center gap-2">
        <Switch bind:checked={filterIssuesOnly} id="filter-issues" />
        <label for="filter-issues" class="text-sm text-muted-foreground cursor-pointer">
          Show issues only
        </label>
      </div>
      <div class="text-sm text-muted-foreground">
        Showing {filteredSites.length} of {reportData.sites.length} sites
      </div>
    </div>

    <div class="flex-1 overflow-auto space-y-2">
      {#each filteredSites as site (site.id)}
        <SiteRow
          {site}
          expanded={expandedSites.has(site.id)}
          onToggle={() => toggleSite(site.id)}
        />
      {/each}

      {#if filteredSites.length === 0}
        <div class="text-center py-12 text-muted-foreground">
          {#if searchQuery || filterIssuesOnly}
            No sites match your filters
          {:else}
            No sites found
          {/if}
        </div>
      {/if}
    </div>
  {:else}
    <div class="flex-1 flex items-center justify-center">
      <div class="text-center space-y-4">
        <div class="text-muted-foreground">
          Click "Generate Report" to compare contract units with actual device counts
        </div>
        <Button onclick={generateReport} size="lg">
          <RefreshCw class="h-4 w-4 mr-2" />
          Generate Report
        </Button>
      </div>
    </div>
  {/if}
</div>
