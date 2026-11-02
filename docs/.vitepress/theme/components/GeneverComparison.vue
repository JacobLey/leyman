<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

interface SuiteResult {
    error?: string;
    typeErrors: string[];
    probes: boolean[];
    generateMs?: number;
    generateError?: string;
}
interface ToolReport {
    name: string;
    packageName: string;
    version: string;
    results: Partial<Record<SuiteId, SuiteResult>>;
}
type SuiteId = 'jsonSchema' | 'openApi';
interface Report {
    generatedAt: string;
    commit: string;
    suites: Record<SuiteId, { feature: string; description: string }[]>;
    benchmark: { definitions: number; runs: number };
    tools: ToolReport[];
}

// The nightly `comparison-report.yml` workflow commits here. It is fetched by the browser, so that every deploy of the
// site doesn't have to carry it
const reportUrl =
    'https://raw.githubusercontent.com/JacobLey/leyman/refs/reports/comparison/genever.json';

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

const suiteTitles: Record<SuiteId, string> = {
    jsonSchema: 'JSON Schema',
    openApi: 'OpenAPI',
};
const suiteIds = Object.keys(suiteTitles) as SuiteId[];

const passed = ({ probes }: SuiteResult): number => probes.filter(Boolean).length;

const ranOn = computed(() => report.value && new Date(report.value.generatedAt).toUTCString());

// One row per feature, with what each tool passed of that feature's probes
const features = computed(() => {
    const current = report.value;
    if (!current) {
        return [];
    }
    return suiteIds.map(id => {
        const tools = current.tools.filter(({ results }) => results[id]);
        const names = [...new Set(current.suites[id].map(({ feature }) => feature))];
        return {
            id,
            title: suiteTitles[id],
            tools,
            rows: names.map(feature => {
                const indexes = current.suites[id].flatMap((probe, index) =>
                    probe.feature === feature ? [index] : []
                );
                return {
                    feature,
                    cells: tools.map(({ results }) => ({
                        passed: indexes.filter(index => results[id]?.probes[index]).length,
                        total: indexes.length,
                        failures: indexes
                            .filter(index => !results[id]?.probes[index])
                            .map(index => current.suites[id][index]?.description)
                            .join(', '),
                    })),
                };
            }),
        };
    });
});

const timed = computed(() => {
    const current = report.value;
    if (!current) {
        return [];
    }
    return suiteIds.map(id => ({
        id,
        title: suiteTitles[id],
        rows: current.tools
            .flatMap(({ name, results }) => {
                const result = results[id];
                return result?.generateMs === undefined && !result?.generateError
                    ? []
                    : [{ name, ms: result.generateMs, error: result.generateError }];
            })
            .toSorted((a, b) => (a.ms ?? Infinity) - (b.ms ?? Infinity)),
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
        <table>
            <thead>
                <tr>
                    <th>Tool</th>
                    <th>Version</th>
                    <th v-for="id in suiteIds" :key="id">{{ suiteTitles[id] }} probes</th>
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
                    <td v-for="id in suiteIds" :key="id">
                        <template v-if="tool.results[id]">
                            {{ passed(tool.results[id]!) }} / {{ tool.results[id]!.probes.length }}
                        </template>
                        <template v-else>—</template>
                    </td>
                </tr>
            </tbody>
        </table>

        <template v-for="suite in features" :key="suite.id">
            <h2>{{ suite.title }} probes by feature</h2>
            <table>
                <thead>
                    <tr>
                        <th>Feature</th>
                        <th v-for="tool in suite.tools" :key="tool.name">{{ tool.name }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="row in suite.rows" :key="row.feature">
                        <td>{{ row.feature }}</td>
                        <td
                            v-for="(cell, index) in row.cells"
                            :key="index"
                            :title="cell.failures"
                        >
                            {{ cell.passed === cell.total ? '✅' : `${cell.passed} / ${cell.total}` }}
                        </td>
                    </tr>
                </tbody>
            </table>
        </template>

        <h2>Time to generate</h2>
        <p>
            Median of {{ report.benchmark.runs }} runs on a document with
            {{ report.benchmark.definitions }} definitions, in milliseconds.
        </p>
        <template v-for="suite in timed" :key="suite.id">
            <h3>{{ suite.title }}</h3>
            <table>
                <thead>
                    <tr>
                        <th>Tool</th>
                        <th>Time</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="row in suite.rows" :key="row.name">
                        <td>{{ row.name }}</td>
                        <td>{{ row.ms === undefined ? `failed: ${row.error}` : `${Math.round(row.ms)} ms` }}</td>
                    </tr>
                </tbody>
            </table>
        </template>
    </template>
</template>
