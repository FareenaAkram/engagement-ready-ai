# Functional Requirements

> Derived from [`engagement-ready-ai-schema.jsonld`](../engagement-ready-ai-schema.jsonld) — ontology namespace `https://engagement-ready-ai.ibm.com/ontology/v1#`

---

## Overview

Functional requirements describe **what the Engagement Ready AI system must do** — the behaviours, operations, and capabilities that each entity in the ontology must support. They are extracted from discovery notes by **Agent 1 (Discovery Consolidator)** and validated by **Agent 2 (Delivery Readiness Analyst)** running on IBM watsonx.ai Granite 3.

Each functional requirement below is derived directly from the `Entity` and `Operation` nodes in the ontology schema, covering identity, attributes, lifecycle operations, and relational constraints.

---

## 1. EngagementPackage — `era:EngagementPackage`

**Entity type:** `Entity`  
**Identity key:** `packageId` (UUID)  
**Human reference:** `engagementName`

### 1.1 Creation
- The system **must** create an `EngagementPackage` upon completion of the 3-agent watsonx.ai pipeline.
- The system **must** assign a unique `packageId` to every package at export time.
- The system **must** set `source` to the fixed string `"engagement-ready-ai"`.
- The system **must** set `schema` to the fixed string `"engagement-ready-ai/ica-delivery/v1"`.
- The system **must** record `exportedAt` as an ISO 8601 UTC timestamp at the moment of export.

### 1.2 Composition
- The system **must** embed exactly one `Engagement` object inside each package.
- The system **must** embed exactly one `ReadinessResult` inside each package.
- The system **must** embed exactly one `AnalysisResult` inside each package.
- The system **must** embed one or more `ConsultingAsset` objects inside each package.
- The system **must** allow `humanInTheLoop` to be `null` until the consultant records their HITL decision.

### 1.3 Delivery
- The system **must** support a `notifyEmails` list of one or more email addresses for ICA notification.
- The system **must not** deliver a package to ICA until a `HITLRecord` is attached (non-null).

---

## 2. Engagement — `era:Engagement`

**Entity type:** `Entity`  
**Identity key:** `engagementId` (string)  
**Human reference:** `name`

### 2.1 Identity
- The system **must** generate `engagementId` following the pattern `eng-{unix-timestamp}`.
- The system **must** require `name` and `client` to be non-empty strings before an assessment can begin.
- The system **must** capture `leadConsultant` (full name) before the assessment pipeline is triggered.
- The system **must** record `assessedAt` as the ISO 8601 UTC timestamp when Agent 2 completes scoring.

### 2.2 Relationships
- An `Engagement` **must** relate to at least one `Stakeholder`.
- An `Engagement` **must** be linked to exactly one `EngagementPackage`.

---

## 3. Stakeholder — `era:Stakeholder`

**Entity type:** `Entity`  
**Identity key:** `stakeholderId` (UUID)  
**Human reference:** `stakeholderName`

### 3.1 Identification
- The system **must** require `stakeholderName` to be non-empty for every stakeholder record.
- The system **must** require `role` to be one of the defined values: `executive-sponsor`, `product-owner`, `lead-consultant`, `solution-architect`, `security-lead`, `ciso`, `project-manager`, `client-it-lead`, `business-analyst`, `end-user-representative`.
- The system **must** assign `status` as one of: `confirmed`, `identified`, `missing`.

### 3.2 Delivery Blocking
- The system **must** set `blocksDelivery = true` when a stakeholder with a critical role (e.g. `ciso`) has `status = missing`.
- The system **must** surface a missing critical stakeholder in the `AnalysisResult.criticalIssues` array.

---

## 4. Requirement — `era:Requirement`

**Entity type:** `Entity`  
**Identity key:** `requirementId` (string)  
**Human reference:** `requirementLabel`

### 4.1 Extraction
- Agent 1 **must** extract all requirements from discovery notes and assign each a unique `requirementId`.
- The system **must** assign `type` to each requirement from the allowed values: `functional`, `non-functional`, `security`, `performance`, `compliance`, `integration`, `data`, `user-experience`, `operational`, `business`.
- The system **must** set the initial status to `identified` when a requirement is first extracted.

### 4.2 Lifecycle Transitions
- The system **must** allow a requirement to progress through the following states in order:
  1. `RequirementIdentified` → `RequirementClarified` → `RequirementValidated`
- The system **must** allow a requirement to be branched to `RequirementConflicted`, `RequirementOutOfScope`, or `RequirementDeferred` at any point before validation.
- The system **must** emit the event `era:RequirementValidated` when a requirement reaches terminal validated state.
- The system **must** emit `era:RequirementConflicted` when a conflict is detected between two requirements.

### 4.3 Conflicts and Blocking
- The system **must** flag any conflicted requirement in `AnalysisResult.criticalIssues`.
- The system **must** prevent the engagement from being marked `ready` while any requirement has `blocksDelivery = true` and remains unresolved.
- The system **must** require consultant justification before a `blocksDelivery = true` requirement can be set to `deferred`.

### 4.4 Terminal States
| State | Meaning |
|---|---|
| `RequirementValidated` | Confirmed — contributes to a Goal and readiness score |
| `RequirementOutOfScope` | Explicitly excluded from this engagement |
| `RequirementDeferred` | Deferred to a future phase — requires consultant justification |

---

## 5. Goal — `era:Goal`

**Entity type:** `Entity`  
**Identity key:** `goalId` (UUID)  
**Human reference:** `goalName`

### 5.1 Definition
- The system **must** require `goalName` to be unique within an engagement.
- The system **must** assign `type` from: `strategic`, `operational`, `compliance`, `competitive`, `cost`, `revenue`.
- The system **must** assign `priority` from: `critical`, `high`, `medium`, `low`.

### 5.2 Readiness Gate
- The system **must** block the engagement from being marked `ready` if any `critical` goal has no validated requirement linked via the `SupportsGoal` operation.

---

## 6. Operations

Operations define the **directed relationships** between entities. The system must enforce their preconditions and postconditions.

### 6.1 HasEngagement — `era:HasEngagement`
| Field | Value |
|---|---|
| From | `era:EngagementPackage` |
| To | `era:Engagement` |

- **Precondition:** EngagementPackage must exist; Engagement must have a valid `engagementId` and `name`.
- **Postcondition:** Package is bound to exactly one Engagement; Engagement identity is accessible from the package.

### 6.2 HasReadiness — `era:HasReadiness`
| Field | Value |
|---|---|
| From | `era:EngagementPackage` |
| To | `era:ReadinessResult` |

- **Precondition:** EngagementPackage must exist; Agent 2 pipeline must have completed scoring.
- **Postcondition:** Package holds exactly one ReadinessResult; `decision`, `score`, and `confidence` are all populated.

### 6.3 HasHITLRecord — `era:HasHITLRecord`
| Field | Value |
|---|---|
| From | `era:EngagementPackage` |
| To | `era:HITLRecord` |

- **Precondition:** ReadinessResult must already be scored; consultant must have reviewed the AI recommendation.
- **Postcondition:** `consultantDecision` is recorded as `accepted` or `overridden`; justification is populated if overridden.

### 6.4 HasConsultingAsset — `era:HasConsultingAsset`
| Field | Value |
|---|---|
| From | `era:EngagementPackage` |
| To | `era:ConsultingAsset` |

- **Precondition:** Agent 3 pipeline must have completed asset generation.
- **Postcondition:** Package holds one or more ConsultingAssets, each with a unique `assetId` and non-empty `content`.

### 6.5 SupportsGoal — `era:SupportsGoal`
| Field | Value |
|---|---|
| From | `era:Requirement` |
| To | `era:Goal` |

- **Precondition:** Both Requirement and Goal must exist within the same engagement.
- **Postcondition:** Requirement is recorded as contributing to the Goal; readiness check considers that goal covered.

### 6.6 DependsOn — `era:DependsOn`
| Field | Value |
|---|---|
| From | `era:Requirement` |
| To | `era:Requirement` |

- **Precondition:** Both requirements must exist; no circular dependencies allowed.
- **Postcondition:** Dependent requirement is blocked until the prerequisite is validated.

### 6.7 ConflictsWith — `era:ConflictsWith`
| Field | Value |
|---|---|
| From | `era:Requirement` |
| To | `era:Requirement` |

- **Precondition:** Conflict must be documented with a description.
- **Postcondition:** Both requirements set to status `conflicted`; conflict surfaced in `criticalIssues`.

### 6.8 BlocksDelivery — `era:BlocksDelivery`
| Field | Value |
|---|---|
| From | `era:EngagementRisk` |
| To | `era:ReadinessResult` |

- **Precondition:** Risk must be in `open` status.
- **Postcondition:** ReadinessResult cannot be set to `ready` while this risk is unresolved.

### 6.9 AssignedTo — `era:AssignedTo`
| Field | Value |
|---|---|
| From | `era:EngagementRisk` |
| To | `era:Stakeholder` |

- **Precondition:** Risk must exist; target role must be a valid `ownerRole` value.
- **Postcondition:** Owner role is accountable for delivering the `recommendedAction`.

### 6.10 OverridesAIRecommendation — `era:OverridesAIRecommendation`
| Field | Value |
|---|---|
| From | `era:HITLRecord` |
| To | `era:ReadinessResult` |

- **Precondition:** `consultantDecision` must be `overridden`; `justification` must be non-empty.
- **Postcondition:** Override is stored in audit trail; `consultantChoice` supersedes the AI decision for ICA delivery.

---

## 7. ConsultingAsset Functional Requirements — `era:ConsultingAsset`

**Entity type:** `Entity`  
**Identity key:** `assetId` (string)  
**Human reference:** `title`

- The system **must** generate all 10 asset types via Agent 3 upon engagement assessment completion:

| Asset Type | Purpose |
|---|---|
| `executive-summary` | C-suite-ready summary — used in ICA email notification body |
| `business-requirements` | BRD-style business goals and success criteria |
| `functional-requirements` | Feature and capability requirements |
| `non-functional-requirements` | Performance, security, scalability, compliance |
| `user-stories` | Agile stories in "As a [role] I want [goal] so that [benefit]" format |
| `risks` | Full risk register with severity, owner, impact, mitigation |
| `assumptions` | Unvalidated assumptions from discovery |
| `open-questions` | Questions requiring client or stakeholder answers |
| `proposal-inputs` | Scope signals, effort estimates, commercial notes |
| `next-agenda` | Structured next discovery or architecture workshop agenda |

- Every asset **must** start in `draft` status when AI-generated.
- The system **must** allow consultants to edit `content` before changing `status` to `reviewed` or `approved`.
- The system **must not** deliver any asset to ICA until its `status` is `approved`.

---

## 8. ConsultingAction Functional Requirements — `era:ConsultingAction`

**Entity type:** `Entity`  
**Identity key:** `actionId` (string)  
**Human reference:** `title`

- The system **must** generate one `ConsultingAction` per entry in `AnalysisResult.criticalIssues`.
- Each action **must** have a unique `actionId` within the package.
- The system **must** require `title` to be an actionable verb phrase (e.g. "Schedule Architecture Workshop").
- The system **must** assign `ownerRole` from: `consultant`, `architect`, `partner`, `client`.
- The system **must** assign `priority` from: `critical`, `high`, `medium`, `low`.
- ICA **must** create one task per `ConsultingAction` when the package is delivered.

### Action Lifecycle
```
ActionPending → ActionAcknowledged → ActionInProgress → ActionCompleted
```
- A `ConsultingAction` **must** pass through `ActionInProgress` before it can be set to `ActionCompleted`.

---

*Source ontology: `https://engagement-ready-ai.ibm.com/ontology/v1#` — Engagement Ready AI, IBM watsonx Challenge*
