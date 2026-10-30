<script setup lang="ts">
import { AGENT_ROLE_META, REMEDY_CHANNEL_LABEL, VOTING_ROLES, type AgentRole, type RemedyChannel } from '#shared/constants'
import type { ChairDecision, HardGates } from '~~/server/db/schema'
import { TONE_CLASS, fmtDate, money, titleize } from '~/utils/format'

/** Structural types: API payloads arrive JSON-serialised (dates as strings). */
export interface TranscriptMessage {
  id: string
  round: number
  seq: number
  role: string
  kind: 'finding' | 'critique' | 'reply' | 'proposal' | 'chair_summary' | 'gate_check'
  content: string
  structured: Record<string, unknown>
  citations: string[]
  targetRole: string | null
  model: string
}
export interface TranscriptVote {
  id: string
  role: string
  vote: string
  rationale: string
  dissent: boolean
}
export interface TranscriptRun {
  id: string
  trigger: string
  mode: string
  promptVersion: string
  status: string
  dossierHash: string
  decision: ChairDecision | null
  usage: { promptTokens: number; completionTokens: number; estimatedCostUsd: number } | null
  error: string | null
  completedAt: string | Date | null
  createdAt: string | Date
  messages: TranscriptMessage[]
  votes: TranscriptVote[]
}

const props = defineProps<{ run: TranscriptRun }>()

const ROLE_BG: Record<string, string> = {
  azure: 'bg-azure-100 text-azure-700 dark:bg-azure-600/20 dark:text-azure-300',
  verdigris: 'bg-verdigris-100 text-verdigris-800 dark:bg-verdigris-600/20 dark:text-verdigris-300',
  aurum: 'bg-aurum-100 text-aurum-700 dark:bg-aurum-600/20 dark:text-aurum-300',
  fern: 'bg-fern-100 text-fern-700 dark:bg-fern-600/20 dark:text-fern-300',
  garnet: 'bg-garnet-100 text-garnet-700 dark:bg-garnet-600/20 dark:text-garnet-300',
  orchid: 'bg-orchid-100 text-orchid-700 dark:bg-orchid-600/20 dark:text-orchid-300',
}
function roleMeta(role: string) {
  return AGENT_ROLE_META[role as AgentRole] ?? { label: titleize(role), short: role.slice(0, 2).toUpperCase(), color: 'azure', description: '' }
}
function roleClass(role: string) {
  return ROLE_BG[roleMeta(role).color] ?? ROLE_BG.azure
}

const ROUND_META: Record<number, { title: string; hint: string }> = {
  1: { title: 'Round 1 · Independent findings', hint: 'Each specialist reads the same PII-minimised dossier and reports what the evidence supports, citing evidence labels.' },
  2: { title: 'Round 2 · Critiques & replies', hint: 'Agents attack each other\'s weakest claims; the targeted agent must reply and say whether its position changed.' },
  3: { title: 'Round 3 · Proposals & ballots', hint: 'Specialists propose a channel and vote. Dissents are recorded verbatim.' },
  4: { title: 'Hard gates & chair decision', hint: 'Deterministic gates run outside the model. The chair reconciles ballots but cannot override a failed gate.' },
}
const rounds = computed(() => {
  const map = new Map<number, TranscriptMessage[]>()
  for (const m of props.run.messages) {
    if (!map.has(m.round)) map.set(m.round, [])
    map.get(m.round)!.push(m)
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).filter(([r]) => r < 4)
})
const gate = computed(() => props.run.messages.find(m => m.kind === 'gate_check')?.structured as unknown as HardGates | undefined)
const decision = computed(() => (props.run.decision ?? (props.run.messages.find(m => m.kind === 'chair_summary')?.structured as unknown as ChairDecision | undefined)) ?? null)
const voteByRole = computed(() => Object.fromEntries(props.run.votes.map(v => [v.role, v])) as Record<string, TranscriptVote>)
const openRounds = ref<Record<number, boolean>>({ 1: false, 2: true, 3: true })
const expandedMsg = ref<Record<string, boolean>>({})

function msgTitle(m: TranscriptMessage) {
  const s = m.structured as Record<string, unknown>
  if (m.kind === 'critique') return `Critique → ${roleMeta(String(m.targetRole ?? s.targetRole ?? '')).label}`
  if (m.kind === 'reply') return `Reply${s.positionChanged ? ' · position changed' : ' · position held'}`
  if (m.kind === 'proposal') return `Proposal · ${REMEDY_CHANNEL_LABEL[s.channel as RemedyChannel] ?? titleize(String(s.channel))}`
  return 'Finding'
}
const voteTone: Record<string, string> = { support: TONE_CLASS.success, oppose: TONE_CLASS.danger, abstain: TONE_CLASS.neutral }
const outcomeTone: Record<string, string> = { proceed: TONE_CLASS.success, collect_evidence: TONE_CLASS.warning, monitor_only: TONE_CLASS.info, escalate: TONE_CLASS.warning, reject: TONE_CLASS.danger }
</script>

<template>
  <div class="space-y-4">
    <!-- Run meta -->
    <div class="flex flex-wrap items-center gap-2 text-xs text-fg-2">
      <ModeBadge :mode="run.mode" size="sm" />
      <span class="pill bg-surface-3">{{ titleize(run.trigger) }}</span>
      <span class="pill" :class="run.status === 'completed' ? TONE_CLASS.success : run.status === 'failed' ? TONE_CLASS.danger : TONE_CLASS.info">{{ titleize(run.status) }}</span>
      <span>Prompt {{ run.promptVersion }}</span>
      <span class="mono" :title="run.dossierHash">dossier {{ run.dossierHash.slice(0, 12) }}</span>
      <span v-if="run.usage?.estimatedCostUsd" class="num">{{ money(run.usage.estimatedCostUsd) }} · {{ run.usage.promptTokens + run.usage.completionTokens }} tok</span>
      <span class="ml-auto">{{ fmtDate(run.completedAt ?? run.createdAt, 'time') }}</span>
    </div>
    <p v-if="run.error" class="note note-danger">{{ run.error }}</p>

    <!-- Roundtable -->
    <div class="flex flex-wrap gap-2">
      <div v-for="role in [...VOTING_ROLES, 'decision_chair']" :key="role" class="flex items-center gap-2 rounded-full border border-border pl-1 pr-3 py-1 text-xs bg-surface" :title="roleMeta(role).description">
        <span class="size-6 rounded-full grid place-items-center font-bold text-[10px]" :class="roleClass(role)">{{ roleMeta(role).short }}</span>
        <span class="font-medium">{{ roleMeta(role).label }}</span>
        <span v-if="voteByRole[role]" class="pill !py-0" :class="voteTone[voteByRole[role]!.vote]">{{ voteByRole[role]!.vote }}</span>
        <span v-else-if="role === 'decision_chair'" class="text-fg-3">chair</span>
      </div>
    </div>

    <!-- Rounds -->
    <section v-for="[round, msgs] in rounds" :key="round" class="rounded-lg border border-border overflow-hidden">
      <button class="w-full flex items-center gap-3 px-4 py-3 text-left bg-surface-2 hover:bg-surface-3 transition-colors" :aria-expanded="openRounds[round] !== false" @click="openRounds[round] = openRounds[round] === false">
        <Icon :name="openRounds[round] !== false ? 'lucide:chevron-down' : 'lucide:chevron-right'" class="size-4 text-fg-3" />
        <div class="min-w-0 flex-1">
          <p class="font-semibold text-sm">{{ ROUND_META[round]?.title ?? `Round ${round}` }}</p>
          <p class="text-xs text-fg-3">{{ ROUND_META[round]?.hint }}</p>
        </div>
        <span class="text-xs text-fg-3">{{ msgs.length }} messages</span>
      </button>
      <ol v-if="openRounds[round] !== false" class="divide-y divide-border">
        <li v-for="m in msgs" :key="m.id" class="px-4 py-3" :class="m.kind === 'reply' ? 'pl-12 bg-surface/50' : ''">
          <div class="flex items-start gap-3">
            <span class="size-7 rounded-full grid place-items-center font-bold text-[10px] shrink-0 mt-0.5" :class="roleClass(m.role)">{{ roleMeta(m.role).short }}</span>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span class="font-semibold text-fg">{{ roleMeta(m.role).label }}</span>
                <span class="text-fg-3">{{ msgTitle(m) }}</span>
                <span v-if="m.kind === 'critique' && (m.structured as Record<string, unknown>).severity" class="pill !py-0" :class="(m.structured as Record<string, unknown>).severity === 'blocking' ? TONE_CLASS.danger : (m.structured as Record<string, unknown>).severity === 'material' ? TONE_CLASS.warning : TONE_CLASS.neutral">{{ (m.structured as Record<string, unknown>).severity }}</span>
                <span v-if="m.kind === 'finding' && (m.structured as Record<string, unknown>).confidence != null" class="num text-fg-3">conf {{ Math.round(Number((m.structured as Record<string, unknown>).confidence) * 100) }}%</span>
                <span class="mono text-fg-3 ml-auto truncate max-w-40" :title="m.model">{{ m.model }}</span>
              </div>
              <p class="text-sm mt-1 whitespace-pre-wrap" :class="!expandedMsg[m.id] && m.content.length > 420 ? 'line-clamp-4' : ''">{{ m.content }}</p>
              <div class="flex flex-wrap items-center gap-1.5 mt-1.5">
                <span v-for="c in m.citations" :key="c" class="mono text-[10px] px-1.5 py-0.5 rounded bg-surface-3 text-fg-2">{{ c }}</span>
                <template v-if="m.kind === 'finding' && Array.isArray((m.structured as Record<string, unknown>).keyFacts)">
                  <span class="text-[10px] text-fg-3 ml-1">{{ ((m.structured as Record<string, unknown>).keyFacts as string[]).length }} key facts · {{ (((m.structured as Record<string, unknown>).concerns as string[]) ?? []).length }} concerns</span>
                </template>
                <button v-if="m.content.length > 420 || m.kind === 'proposal' || m.kind === 'finding'" class="text-[11px] text-accent hover:underline ml-auto" @click="expandedMsg[m.id] = !expandedMsg[m.id]">{{ expandedMsg[m.id] ? 'Less' : 'Details' }}</button>
              </div>
              <div v-if="expandedMsg[m.id]" class="mt-2 rounded-md bg-surface-2 p-3 text-xs space-y-2">
                <template v-if="m.kind === 'finding'">
                  <div><p class="eyebrow">Key facts</p><ul class="list-disc pl-4 mt-1 space-y-0.5"><li v-for="(f, i) in ((m.structured as Record<string, unknown>).keyFacts as string[]) ?? []" :key="i">{{ f }}</li></ul></div>
                  <div v-if="(((m.structured as Record<string, unknown>).concerns as string[]) ?? []).length"><p class="eyebrow">Concerns</p><ul class="list-disc pl-4 mt-1 space-y-0.5"><li v-for="(f, i) in (m.structured as Record<string, unknown>).concerns as string[]" :key="i">{{ f }}</li></ul></div>
                </template>
                <template v-else-if="m.kind === 'proposal'">
                  <div class="grid gap-2 sm:grid-cols-2">
                    <div><p class="eyebrow">Requested outcome</p><p class="mt-1">{{ (m.structured as Record<string, unknown>).requestedOutcome }}</p></div>
                    <div><p class="eyebrow">Timeline</p><p class="mt-1">{{ (m.structured as Record<string, unknown>).estimatedTimeline || '—' }}</p></div>
                  </div>
                  <div v-if="(((m.structured as Record<string, unknown>).risks as string[]) ?? []).length"><p class="eyebrow">Risks</p><ul class="list-disc pl-4 mt-1 space-y-0.5"><li v-for="(f, i) in (m.structured as Record<string, unknown>).risks as string[]" :key="i">{{ f }}</li></ul></div>
                  <div v-if="(((m.structured as Record<string, unknown>).proofRequirements as string[]) ?? []).length"><p class="eyebrow">Proof requirements</p><ul class="list-disc pl-4 mt-1 space-y-0.5"><li v-for="(f, i) in (m.structured as Record<string, unknown>).proofRequirements as string[]" :key="i">{{ f }}</li></ul></div>
                  <div><p class="eyebrow">Uncertainty</p><p class="mt-1">{{ (m.structured as Record<string, unknown>).uncertainty }}</p></div>
                </template>
                <pre v-else class="whitespace-pre-wrap mono text-[11px]">{{ JSON.stringify(m.structured, null, 2) }}</pre>
              </div>
            </div>
          </div>
        </li>
      </ol>
    </section>

    <!-- Votes -->
    <section v-if="run.votes.length" class="rounded-lg border border-border overflow-hidden">
      <div class="px-4 py-3 bg-surface-2"><p class="font-semibold text-sm">Recorded ballots</p><p class="text-xs text-fg-3">One ballot per voting role. The chair does not vote.</p></div>
      <ul class="divide-y divide-border">
        <li v-for="v in run.votes" :key="v.id" class="px-4 py-3 flex items-start gap-3">
          <span class="size-7 rounded-full grid place-items-center font-bold text-[10px] shrink-0" :class="roleClass(v.role)">{{ roleMeta(v.role).short }}</span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2 text-xs">
              <span class="font-semibold text-fg">{{ roleMeta(v.role).label }}</span>
              <span class="pill !py-0" :class="voteTone[v.vote]">{{ v.vote }}</span>
              <span v-if="v.dissent" class="pill !py-0" :class="TONE_CLASS.warning">dissent recorded</span>
            </div>
            <p class="text-sm mt-1">{{ v.rationale }}</p>
          </div>
        </li>
      </ul>
    </section>

    <!-- Gates + Chair -->
    <section class="grid gap-4 md:grid-cols-2">
      <div class="rounded-lg border border-border p-4">
        <p class="font-semibold text-sm flex items-center gap-2"><Icon name="lucide:shield-check" class="size-4 text-fern-500" /> Hard gates</p>
        <p class="text-xs text-fg-3 mt-0.5">Deterministic checks outside the models. A failed gate forces the outcome regardless of the vote.</p>
        <ul v-if="gate" class="mt-3 space-y-1.5 text-sm">
          <li v-for="g in [
            { k: 'evidenceSufficient', l: 'Evidence sufficient' },
            { k: 'compliancePassed', l: 'Compliance review passed' },
            { k: 'consentPresent', l: 'User consent present' },
            { k: 'fabricationCheckPassed', l: 'No unsupported citations' },
          ]" :key="g.k" class="flex items-center gap-2">
            <Icon :name="gate[g.k as keyof HardGates] ? 'lucide:circle-check' : 'lucide:circle-x'" class="size-4" :class="gate[g.k as keyof HardGates] ? 'text-fern-500' : 'text-garnet-500'" />
            {{ g.l }}
          </li>
        </ul>
        <ul v-if="gate?.notes?.length" class="mt-3 text-xs text-fg-2 space-y-1 border-t border-border pt-3">
          <li v-for="(n, i) in gate.notes" :key="i">· {{ n }}</li>
        </ul>
        <p v-if="!gate" class="text-sm text-fg-3 mt-3">Gate check not recorded for this run.</p>
      </div>
      <div class="rounded-lg border border-border p-4" :class="decision ? 'border-orchid-500/40' : ''">
        <p class="font-semibold text-sm flex items-center gap-2"><span class="size-5 rounded-full grid place-items-center font-bold text-[9px]" :class="roleClass('decision_chair')">DC</span> Chair decision</p>
        <template v-if="decision">
          <div class="flex flex-wrap items-center gap-2 mt-2">
            <span class="pill" :class="outcomeTone[decision.outcome]">{{ titleize(decision.outcome) }}</span>
            <span class="pill bg-surface-3 text-fg-2">{{ REMEDY_CHANNEL_LABEL[decision.selectedChannel] ?? titleize(decision.selectedChannel) }}</span>
            <span v-if="!decision.gatesRespected" class="pill" :class="TONE_CLASS.warning" title="The chair's preferred outcome was overridden by a hard gate">gate-bound</span>
          </div>
          <p class="text-sm mt-2 whitespace-pre-wrap">{{ decision.summary }}</p>
          <div class="mt-3 flex items-center gap-3 text-xs">
            <span class="pill" :class="TONE_CLASS.success">{{ decision.tally?.support ?? 0 }} support</span>
            <span class="pill" :class="TONE_CLASS.danger">{{ decision.tally?.oppose ?? 0 }} oppose</span>
            <span class="pill" :class="TONE_CLASS.neutral">{{ decision.tally?.abstain ?? 0 }} abstain</span>
          </div>
          <div v-if="decision.minorityOpinion" class="mt-3 text-xs rounded-md bg-surface-2 p-3"><p class="eyebrow mb-1">Minority opinion</p>{{ decision.minorityOpinion }}</div>
        </template>
        <p v-else class="text-sm text-fg-3 mt-3">{{ run.status === 'running' || run.status === 'queued' ? 'Deliberation in progress…' : 'No decision recorded.' }}</p>
      </div>
    </section>
  </div>
</template>
