<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

interface ProbeResult {
    outcome: 'fail' | 'n/a' | 'pass';
    detail?: string;
}
type BundleResult = { minified: number; gzip: number; nodeBuiltins: string[] } | { error: string };
interface ToolReport {
    name: string;
    packageName: string;
    version: string;
    probes: ProbeResult[];
    errors: { feature: string; message: string }[];
    bundle: BundleResult;
    parse: { ms: number } | { error: string };
}
interface Report {
    generatedAt: string;
    commit: string;
    probes: { feature: string; description: string; xsdOnly: boolean }[];
    benchmark: { items: number; runs: number; bytes: number };
    tools: ToolReport[];
}

// The nightly `comparison-report.yml` workflow commits here. It is fetched by the browser, so that every deploy of the
// site doesn't have to carry it
const reportUrl =
    'https://raw.githubusercontent.com/JacobLey/leyman/refs/reports/comparison/xenever.json';

const report = ref<Report>();
const failed = ref(false);

onMounted(async () => {
    try {
        const response = await fetch(reportUrl);
        if (!response.ok) {
            throw new Error(`${response.status}`);
        }
        report.value = (await response.json()) as Report;
    } catch {
        failed.value = true;
    }
});

const ranOn = computed(() => report.value && new Date(report.value.generatedAt).toUTCString());

const kilobytes = (bytes: number): string => `${(bytes / 1000).toFixed(1)} kB`;

// Passed out of the probes that apply to the tool
const score = ({ probes }: ToolReport): string => {
    const applies = probes.filter(({ outcome }) => outcome !== 'n/a');
    return `${applies.filter(({ outcome }) => outcome === 'pass').length} / ${applies.length}`;
};

// One row per feature, with what each tool passed of that feature's probes
const features = computed(() => {
    const current = report.value;
    if (!current) {
        return [];
    }
    const names = [...new Set(current.probes.map(({ feature }) => feature))];
    return names.map(feature => {
        const indexes = current.probes.flatMap((probe, index) =>
            probe.feature === feature ? [index] : []
        );
        return {
            feature,
            cells: current.tools.map(({ probes }) => {
                const results = indexes.map(index => probes[index]!);
                const passed = results.filter(({ outcome }) => outcome === 'pass').length;
                return {
                    text: results.every(({ outcome }) => outcome === 'n/a')
                        ? '—'
                        : passed === results.length
                          ? '✅'
                          : `${passed} / ${results.length}`,
                    failures: indexes
                        .filter(index => probes[index]!.outcome === 'fail')
                        .map(index => current.probes[index]!.description)
                        .join(', '),
                };
            }),
        };
    });
});

// Every failed probe, with what the tool did instead
const failures = computed(() => {
    const current = report.value;
    if (!current) {
        return [];
    }
    return current.tools.map(({ name, probes }) => ({
        name,
        rows: probes.flatMap((result, index) =>
            result.outcome === 'fail'
                ? [
                      {
                          key: index,
                          probe: `${current.probes[index]!.feature}: ${current.probes[index]!.description}`,
                          detail: result.detail ?? '',
                      },
                  ]
                : []
        ),
    }));
});
</script>

<template>
    <p v-if="failed">
        The latest report couldn't be loaded. It is
        <a :href="reportUrl">available as JSON</a>.
    </p>
    <p v-else-if="!report">Loading the latest report…</p>
    <template v-else>
        <p>
            Last run {{ ranOn }}, at commit
            <a :href="`https://github.com/JacobLey/leyman/commit/${report.commit}`">
                <code>{{ report.commit.slice(0, 8) }}</code>
            </a>.
        </p>

        <h2>Summary</h2>
        <p>
            Parse time is the median of {{ report.benchmark.runs }} parses of a purchase order with
            {{ report.benchmark.items }} items ({{ kilobytes(report.benchmark.bytes) }}), after the
            schema is loaded. Bundle size is what the tool needs at runtime to parse a document,
            bundled and minified with esbuild.
        </p>
        <table>
            <thead>
                <tr>
                    <th>Tool</th>
                    <th>Version</th>
                    <th>Probes</th>
                    <th>Parse</th>
                    <th>Bundle (gzip)</th>
                    <th>Bundle (minified)</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="tool in report.tools" :key="tool.name">
                    <td>
                        <a :href="`https://www.npmjs.com/package/${tool.packageName}`">{{
                            tool.name
                        }}</a>
                    </td>
                    <td>{{ tool.version }}</td>
                    <td>{{ score(tool) }}</td>
                    <td>
                        {{ 'ms' in tool.parse ? `${tool.parse.ms.toFixed(1)} ms` : `failed: ${tool.parse.error}` }}
                    </td>
                    <template v-if="'gzip' in tool.bundle">
                        <td>{{ kilobytes(tool.bundle.gzip) }}</td>
                        <td>
                            {{ kilobytes(tool.bundle.minified) }}
                            <template v-if="tool.bundle.nodeBuiltins.length > 0">
                                (imports Node.js's
                                <code>{{ tool.bundle.nodeBuiltins.join(', ') }}</code>)
                            </template>
                        </td>
                    </template>
                    <td v-else colspan="2">failed: {{ tool.bundle.error }}</td>
                </tr>
            </tbody>
        </table>

        <h2>Probes by feature</h2>
        <p>Hover over a cell to see which probes it failed. — means the probes need an XSD, and the tool reads none.</p>
        <table>
            <thead>
                <tr>
                    <th>Feature</th>
                    <th v-for="tool in report.tools" :key="tool.name">{{ tool.name }}</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="row in features" :key="row.feature">
                    <td>{{ row.feature }}</td>
                    <td v-for="(cell, index) in row.cells" :key="index" :title="cell.failures">
                        {{ cell.text }}
                    </td>
                </tr>
            </tbody>
        </table>

        <h2>Failed probes</h2>
        <template v-for="tool in failures" :key="tool.name">
            <h3>{{ tool.name }}</h3>
            <p v-if="tool.rows.length === 0">None.</p>
            <details v-else>
                <summary>{{ tool.rows.length }} failed, with what the tool did instead</summary>
                <ul>
                    <li v-for="row in tool.rows" :key="row.key">
                        {{ row.probe }}: <code>{{ row.detail }}</code>
                    </li>
                </ul>
            </details>
        </template>
    </template>
</template>
