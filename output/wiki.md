# Codebase Documentation

*Auto-generated wiki documentation*

## Overview

| Metric | Value |
|--------|-------|
| Total Files | 19 |
| Directories | 4 |
| Internal Connections | 12 |
| External Dependencies | 3 |

### Entry Points

- `README.md`
- `app/layout.tsx`
- `app/page.tsx`
- `next-env.d.ts`
- `next.config.ts`

## Architecture Diagram

```mermaid
flowchart TB
  subgraph _["📁 ."]
    _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_README_md["📄 README.md"]
    _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_next_env_d_ts["📄 next-env.d.ts"]
    _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_next_config_ts["📄 next.config.ts"]
    _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_package_lock_json["📄 package-lock.json"]
    _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_package_json["📄 package.json"]
    _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_tsconfig_json["📄 tsconfig.json"]
  end
  subgraph app["📁 app"]
    _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_app_globals_css["📄 globals.css"]
    _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_app_layout_tsx["⚛️ layout.tsx"]
    _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_app_page_module_css["📄 page.module.css"]
    _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_app_page_tsx["⚛️ page.tsx"]
  end
  subgraph components["📁 components"]
    _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_components_Button_module_css["📄 Button.module.css"]
    _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_components_Button_tsx["⚛️ Button.tsx"]
    _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_components_ButtonGrid_module_css["📄 ButtonGrid.module.css"]
    _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_components_ButtonGrid_tsx["⚛️ ButtonGrid.tsx"]
    _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_components_Calculator_module_css["📄 Calculator.module.css"]
    _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_components_Calculator_tsx["⚛️ Calculator.tsx"]
    _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_components_Display_module_css["📄 Display.module.css"]
    _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_components_Display_tsx["⚛️ Display.tsx"]
  end
  subgraph lib["📁 lib"]
    _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_lib_calculator_ts["📄 calculator.ts"]
  end
  _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_app_layout_tsx --> _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_app_globals_css
  _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_app_page_tsx --> _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_components_Calculator_tsx
  _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_app_page_tsx --> _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_app_page_module_css
  _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_components_Button_tsx --> _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_components_Button_module_css
  _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_components_ButtonGrid_tsx --> _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_components_Button_tsx
  _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_components_ButtonGrid_tsx --> _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_components_ButtonGrid_module_css
  _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_components_Calculator_tsx --> _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_lib_calculator_ts
  _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_components_Calculator_tsx --> _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_components_Display_tsx
  _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_components_Calculator_tsx --> _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_components_ButtonGrid_tsx
  _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_components_Calculator_tsx --> _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_components_Calculator_module_css
  _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_components_Display_tsx --> _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_components_Display_module_css

  %% Styling
  style _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_app_layout_tsx fill:#61dafb,color:#000
  style _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_app_page_tsx fill:#61dafb,color:#000
  style _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_components_Button_tsx fill:#61dafb,color:#000
  style _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_components_ButtonGrid_tsx fill:#61dafb,color:#000
  style _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_components_Calculator_tsx fill:#61dafb,color:#000
  style _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_components_Display_tsx fill:#61dafb,color:#000
  style _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_lib_calculator_ts fill:#3178c6,color:#fff
  style _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_next_env_d_ts fill:#3178c6,color:#fff
  style _Users_brianliu_Documents_personal_coding_nexhacks_samples_calculator_next_config_ts fill:#3178c6,color:#fff
```

## External Dependencies

- `next`
- `next/font/google`
- `react`

## Files

### 📁 .

#### 📄 README.md

**Type:** Module
**Exports:** None
**Dependencies:** None
**Used By:** None

---

#### 📄 next-env.d.ts

**Type:** Module
**Exports:** None
**Dependencies:** routes.d.ts
**Used By:** None

---

#### 📄 next.config.ts

**Type:** Module
**Exports:** nextConfig
**Dependencies:** None
**Used By:** None

---

#### 📄 package-lock.json

**Type:** Configuration
**Exports:** None
**Dependencies:** None
**Used By:** None

---

#### 📄 package.json

**Type:** Configuration
**Exports:** None
**Dependencies:** None
**Used By:** None

---

#### 📄 tsconfig.json

**Type:** Configuration
**Exports:** None
**Dependencies:** None
**Used By:** None

---

### 📁 app

#### 📄 globals.css

**Type:** Stylesheet
**Exports:** None
**Dependencies:** None
**Used By:** layout.tsx

---

#### ⚛️ layout.tsx

**Type:** React Component
**Exports:** metadata, RootLayout
**Dependencies:** globals.css
**Used By:** None
**Functions:** RootLayout

---

#### 📄 page.module.css

**Type:** Stylesheet
**Exports:** None
**Dependencies:** None
**Used By:** page.tsx

---

#### ⚛️ page.tsx

**Type:** React Component
**Exports:** Home
**Dependencies:** Calculator.tsx, page.module.css
**Used By:** None
**Functions:** Home

---

### 📁 components

#### 📄 Button.module.css

**Type:** Stylesheet
**Exports:** None
**Dependencies:** None
**Used By:** Button.tsx

---

#### ⚛️ Button.tsx

**Type:** React Component
**Exports:** Button
**Dependencies:** Button.module.css
**Used By:** ButtonGrid.tsx
**Functions:** Button

---

#### 📄 ButtonGrid.module.css

**Type:** Stylesheet
**Exports:** None
**Dependencies:** None
**Used By:** ButtonGrid.tsx

---

#### ⚛️ ButtonGrid.tsx

**Type:** React Component
**Exports:** ButtonGrid
**Dependencies:** Button.tsx, ButtonGrid.module.css
**Used By:** Calculator.tsx
**Functions:** ButtonGrid

---

#### 📄 Calculator.module.css

**Type:** Stylesheet
**Exports:** None
**Dependencies:** None
**Used By:** Calculator.tsx

---

#### ⚛️ Calculator.tsx

**Type:** React Component
**Exports:** Calculator
**Dependencies:** calculator.ts, Display.tsx, ButtonGrid.tsx, Calculator.module.css
**Used By:** page.tsx
**Functions:** Calculator

---

#### 📄 Display.module.css

**Type:** Stylesheet
**Exports:** None
**Dependencies:** None
**Used By:** Display.tsx

---

#### ⚛️ Display.tsx

**Type:** React Component
**Exports:** Display
**Dependencies:** Display.module.css
**Used By:** Calculator.tsx
**Functions:** Display

---

### 📁 lib

#### 📄 calculator.ts

**Type:** Module
**Exports:** add, subtract, multiply, divide, Operation, calculate, parseInput, formatDisplay
**Dependencies:** None
**Used By:** Calculator.tsx
**Functions:** add, subtract, multiply, divide, calculate, parseInput, formatDisplay

---
