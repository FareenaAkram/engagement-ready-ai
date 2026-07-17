# Non-Functional Requirements

> Derived from [`engagement-ready-ai-schema.jsonld`](../engagement-ready-ai-schema.jsonld) — ontology namespace `https://engagement-ready-ai.ibm.com/ontology/v1#`

---

## Overview

Non-functional requirements describe **how the Engagement Ready AI system must perform and behave** — covering data integrity, governance, lifecycle constraints, scoring rules, auditability, and responsible AI principles. They are derived from the `invariant` arrays, `State` nodes, and `Operation` postconditions defined across every entity in the ontology.

These requirements apply to the IBM Consulting Engagement Ready AI platform and all consuming systems, including **IBM Consulting Advantage (ICA)**.

---

## 1. Data Integrity

### 1.1 Uniqueness Constraints
- `EngagementPackage.packageId` **must** be globally unique across all packages.
- `Engagement.engagementId` **must** follow the pattern `eng-{unix-timestamp}` and **must** be unique.
- `Requirement.requirementId` **must** be unique within the scope of its engagement.
- `EngagementRisk.riskId` **must** be unique within the scope of its engagement.
- `ConsultingAsset.assetId` **must** be unique within the scope of its package.
- `ConsultingAction.actionId` **must** be unique within the scope of its package.
- `Goal.goalName` **must** be unique within the scope of its engagement.
- `Stakeholder.stakeholderName` **must** be non-empty.

### 1.2 Referential Integrity
- An `EngagementPackage` **must** contain exactly one `Engagement`, one `ReadinessResult`, and one `AnalysisResult`.
- A `ConsultingAsset` **must not** exist outside of an `EngagementPackage`.
- A `HITLRecord` **must** reference the `ReadinessResult` that was scored before the consultant's decision was recorded.
- `HITLRecord.decidedAt` **must** be a timestamp that occurs **after** `ReadinessResult` was produced.

### 1.3 Enumeration Constraints
All enumerated fields must be validated against their allowed value sets at write time:

| Field | Allowed Values |
|---|---|
| `Requirement.type` | `functional`, `non-functional`, `security`, `performance`, `compliance`, `integration`, `data`, `user-experience`, `operational`, `business` |
| `Requirement.status` | `identified`, `clarified`, `validated`, `conflicted`, `out-of-scope`, `deferred` |
| `Stakeholder.role` | `executive-sponsor`, `product-owner`, `lead-consultant`, `solution-architect`, `security-lead`, `ciso`, `project-manager`, `client-it-lead`, `business-analyst`, `end-user-representative` |
| `Stakeholder.status` | `confirmed`, `identified`, `missing` |
| `ReadinessResult.decision` | `ready`, `ready-with-conditions`, `not-ready` |
| `HITLRecord.consultantDecision` | `accepted`, `overridden` |
| `HITLRecord.consultantChoice` | `ready`, `ready-with-conditions`, `not-ready` |
| `ConsultingAsset.type` | `executive-summary`, `business-requirements`, `functional-requirements`, `non-functional-requirements`, `user-stories`, `risks`, `assumptions`, `open-questions`, `proposal-inputs`, `next-agenda` |
| `ConsultingAsset.status` | `draft`, `reviewed`, `approved` |
| `EngagementRisk.severity` | `critical`, `high`, `medium`, `low` |
| `EngagementRisk.category` | `technical`, `business`, `scope`, `stakeholder` |
| `EngagementRisk.ownerRole` | `consultant`, `architect`, `partner`, `client` |
| `EngagementRisk.status` | `open`, `monitoring`, `resolved` |
| `ConsultingAction.ownerRole` | `consultant`, `architect`, `partner`, `client` |
| `ConsultingAction.priority` | `critical`, `high`, `medium`, `low` |
| `ConsultingAction.status` | `pending`, `acknowledged`, `in-progress`, `completed` |
| `Goal.type` | `strategic`, `operational`, `compliance`, `competitive`, `cost`, `revenue` |
| `Goal.priority` | `critical`, `high`, `medium`, `low` |

---

## 2. Scoring Rules and Thresholds

### 2.1 Readiness Score — `era:ReadinessResult`
The AI-generated readiness score **must** map deterministically to a decision label:

| Score Range | Decision Value | Human Label |
|---|---|---|
| ≥ 80 | `ready` | Ready for Delivery |
| 60 – 79 | `ready-with-conditions` | Ready with Conditions |
| < 60 | `not-ready` | Not Ready |

- `score` **must** be an integer in the range `0–100`. Values outside this range are invalid.
- `confidence` **must** be an integer in the range `0–100`.
- When `confidence` is below 60, the system **must** surface a warning that the discovery notes were sparse or contradictory and the consultant should apply greater personal judgement.

### 2.2 Automatic Blocking
- Any `EngagementRisk` with `severity = critical` **must** automatically set `blocksDelivery = true`.
- Any `Stakeholder` with `status = missing` for a role that is required for compliance or security sign-off **must** automatically set `blocksDelivery = true`.
- A `Requirement` with `blocksDelivery = true` **must** prevent the engagement from reaching `ready` without explicit consultant action.

---

## 3. Responsible AI — Human-in-the-Loop Governance

### 3.1 Mandatory HITL Review — `era:HITLRecord`
- The AI **must never** make the final delivery decision. The `ReadinessResult` is advisory.
- A `HITLRecord` **must** be created and `consultantDecision` recorded before any `ConsultingAsset` can be delivered to ICA.
- `EngagementPackage.humanInTheLoop` **must** remain `null` until the consultant explicitly acts.

### 3.2 Accept Path
- When `consultantDecision = "accepted"`, `consultantChoice` **must** equal `aiRecommendation`.
- `justification` **must** be `null` on the accepted path.

### 3.3 Override Path
- When `consultantDecision = "overridden"`, `justification` **must** be a non-empty string.
- `consultantChoice` may differ from `aiRecommendation` on the override path.
- The system **must** invoke the `OverridesAIRecommendation` operation, permanently linking the `HITLRecord` to the overridden `ReadinessResult`.

### 3.4 Audit Trail Immutability
- Both `aiRecommendation` and `consultantChoice` **must** be stored permanently and **must not** be editable after `decidedAt` is set.
- `decidedAt` **must** be an immutable ISO 8601 UTC timestamp set at the moment the consultant submits their decision.
- The override `justification` **must** be stored in the audit trail and **must not** be deletable.

---

## 4. Lifecycle and State Machine Constraints

### 4.1 Requirement Lifecycle
```
RequirementIdentified
    └─► RequirementClarified
            └─► RequirementValidated         [terminal]
    └─► RequirementConflicted
    └─► RequirementOutOfScope                [terminal]
    └─► RequirementDeferred                  [terminal]
```
- A requirement **must not** skip from `RequirementIdentified` directly to a terminal state without passing through `RequirementClarified` (unless an exception event fires).
- A `RequirementConflicted` requirement **must** block delivery until it is resolved to `RequirementValidated` or `RequirementOutOfScope`.

### 4.2 Readiness Lifecycle
```
ReadinessPending → ReadinessScored → ReadinessDelivered [terminal]
```
- A `ReadinessResult` **must not** transition to `ReadinessDelivered` until a `HITLRecord` is attached.

### 4.3 HITL Lifecycle
```
HITLPending → HITLAccepted     [terminal]
           └► HITLOverridden   [terminal]
```
- A `HITLRecord` **must** be in `HITLPending` state until the consultant acts.
- Once terminal (`HITLAccepted` or `HITLOverridden`), the state **must not** be changed.

### 4.4 ConsultingAsset Lifecycle
```
AssetDraft → AssetReviewed → AssetApproved [terminal]
```
- All AI-generated assets **must** start in `AssetDraft`.
- An asset **must not** be delivered to ICA unless it is in `AssetApproved` state.

### 4.5 EngagementRisk Lifecycle
```
RiskOpen → RiskMonitoring → RiskResolved [terminal]
```
- A `RiskResolved` entry **must** have a non-empty `recommendedAction` documenting what was done to resolve it.
- A `critical` risk **must not** skip `RiskMonitoring` without a consultant acknowledgement.

### 4.6 ConsultingAction Lifecycle
```
ActionPending → ActionAcknowledged → ActionInProgress → ActionCompleted [terminal]
```
- An action **must** pass through `ActionInProgress` before it can be set to `ActionCompleted`.

---

## 5. Content Quality Constraints

### 5.1 AnalysisResult — `era:AnalysisResult`
- `executiveSummary` **must** be 3–5 sentences written in plain English suitable for a C-suite audience.
- `criticalIssues` **must** be a non-empty array when `ReadinessResult.decision` is `ready-with-conditions` or `not-ready`.
- Each entry in `criticalIssues` **must** describe exactly one specific gap or risk in a single plain English sentence.
- `recommendations` **must** be ordered from most to least important.
- `openQuestions` entries **must** be phrased as questions directed at the client or a named stakeholder.

### 5.2 ConsultingAction Title
- `ConsultingAction.title` **must** be an actionable verb phrase (e.g. *"Schedule Architecture Workshop"*, *"Identify Security Compliance Stakeholder"*).

### 5.3 EngagementRisk Title
- `EngagementRisk.title` **must** be 10 words or fewer.

---

## 6. Dependency and Conflict Integrity — `era:DependsOn`, `era:ConflictsWith`

- The `DependsOn` operation **must** reject a link that would create a circular dependency between requirements.
- When `ConflictsWith` is applied between two requirements, the system **must** set both requirements to `status = conflicted` atomically.
- A conflicted pair **must** appear in `AnalysisResult.criticalIssues`.
- A conflicted requirement **must** remain blocked until it is explicitly resolved by a stakeholder decision recorded in a `ConsultingAction`.

---

## 7. Schema Versioning and Source Traceability

- `EngagementPackage.schema` **must** always equal `"engagement-ready-ai/ica-delivery/v1"`. Any package with a different value **must** be rejected by ICA.
- `EngagementPackage.source` **must** always equal `"engagement-ready-ai"`.
- `EngagementPackage.sourceVersion` **must** record the exact application version that generated the package, enabling future migration and audit.

---

## 8. Notification Requirements

- `EngagementPackage.notifyEmails` **must** contain at least one valid email address before the package can be delivered to ICA.
- ICA **must** send a notification to every address in `notifyEmails` upon successful package delivery.
- The notification email body **must** include the `executiveSummary` from the `AnalysisResult`.

---

## 9. Goal-Readiness Gate

- An engagement **must not** be scored as `ready` if any `Goal` with `priority = critical` has zero validated requirements linked via `SupportsGoal`.
- This rule applies regardless of the numeric score — the gate is a hard constraint that overrides the score.

---

## 10. Namespace and Ontology Conformance

- All entities **must** use the `era:` namespace prefix resolving to `https://engagement-ready-ai.ibm.com/ontology/v1#`.
- All JSON-LD `@context` definitions **must** use `id` as a shorthand for `@id` and `type` as a shorthand for `@type`, following the SRO-style context pattern established in the ontology.
- Entity types **must** be declared as one of `Entity`, `Operation`, or `State` — no other type values are permitted at the top-level `@graph` node level.

---

*Source ontology: `https://engagement-ready-ai.ibm.com/ontology/v1#` — Engagement Ready AI, IBM watsonx Challenge*
