# Base JS SDK Image Compression Demo

## Overview

This is a React-TypeScript application that integrates with Lark Base (Feishu 飞书多维表格) to compress images stored in attachment fields. The application uses the Lark Base Open JS SDK to access and modify table data, providing users with a web-based interface to batch compress images with configurable quality and dimension settings. The plugin ensures data safety by validating all operations before updating records.

## Recent Changes (2025-11-06)

- Implemented complete image compression plugin with user-friendly interface
- Added Canvas-based image resizing for independent width/height constraints
- Implemented data safety measures to prevent attachment loss during compression
- Added comprehensive error handling and user feedback
- Created progress tracking with real-time statistics (compressed count, file sizes, savings)
- Configured Vite to run on 0.0.0.0:5000 for Replit compatibility

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- **Framework:** React 18 with TypeScript
- **Build Tool:** Vite (modern, fast bundler replacing traditional webpack)
- **UI Library:** Ant Design 5.8+ for consistent, professional UI components
- **Styling:** CSS modules with global styles

**Rationale:** Vite provides instant hot module replacement and faster builds compared to traditional bundlers like webpack, making the development experience significantly smoother. React with TypeScript ensures type safety and better developer experience. Ant Design was chosen for its comprehensive component library and professional appearance suitable for enterprise applications.

### Application Structure

**Single-Page Application (SPA):**
- Entry point: `src/index.tsx`
- Monolithic component structure (LoadApp component handles all logic)
- State management via React hooks (useState, useEffect)

**Architectural Pattern:** The application follows a simple component-based architecture without complex state management libraries. All business logic resides within the main `LoadApp` component, which is appropriate for the application's limited scope.

**Trade-offs:** While a monolithic component works for this demo, larger applications would benefit from splitting into smaller, reusable components and potentially introducing state management solutions like Redux or Zustand.

### Image Processing

**Library:** browser-image-compression + Canvas API
- Client-side image compression in the browser
- Configurable quality (0-1 scale), maxWidth, and maxHeight parameters
- Custom Canvas-based resizing for independent width/height constraints
- No server-side processing required

**Implementation Details:**
1. **Two-stage compression:**
   - Stage 1: Canvas API resizes images to honor both maxWidth AND maxHeight independently
   - Stage 2: browser-image-compression applies quality-based compression
2. **Data Safety:**
   - Downloads all attachments (images and non-images) before updating
   - Skips record updates if any attachment download fails
   - Validates attachment count before saving
   - Displays skipped records and failed images to users
3. **Batch Processing:**
   - Processes all records in selected attachment field
   - Real-time progress tracking and statistics
   - Preserves non-image attachments unchanged

**Design Decision:** Client-side compression was chosen to:
1. Reduce server infrastructure costs
2. Improve privacy (images never leave the user's browser during compression)
3. Provide immediate feedback to users

**Limitations:** Large-scale batch processing may be constrained by browser memory and processing power.

### Configuration Management

**Vite Configuration:**
- Development server configured to run on `0.0.0.0:5000` for Replit compatibility
- Hot module replacement enabled by default

**TypeScript Configuration:**
- Strict mode enabled for type safety
- ESNext target for modern JavaScript features
- React JSX transformation

## External Dependencies

### Core Integration

**Lark Base Open JS SDK (@lark-base-open/js-sdk v0.3.0-alpha):**
- Primary integration point for accessing Lark Base tables and fields
- Provides APIs for:
  - Getting active table reference
  - Fetching field metadata
  - Reading/writing attachment field data
  - Type definitions for fields (IAttachmentField, IFieldMeta, FieldType)

**Purpose:** Enables the application to function as an embedded plugin within the Lark Base ecosystem, accessing and modifying user data with appropriate permissions.

### Third-Party Libraries

**UI Framework:**
- `antd` (Ant Design v5.8.5): Comprehensive React component library
- Components used: Button, Select, InputNumber, Progress, Alert, Card, Space, Divider, Spin, Typography

**Image Processing:**
- `browser-image-compression` (v2.0.2): Client-side image compression library

**HTTP Client:**
- `axios` (v1.5.0): Promise-based HTTP client (included but not actively used in current code)

**Internationalization (i18n):**
- `i18next` (v23.2.3): Internationalization framework
- `react-i18next` (v13.0.1): React bindings for i18next
- Note: i18n is installed but not implemented in the current codebase, suggesting planned multi-language support

### Development Dependencies

- `@vitejs/plugin-react`: Vite plugin for React support with Fast Refresh
- TypeScript compiler and type definitions for React ecosystem
- Vite bundler for development and production builds

### Runtime Environment

**Node.js Requirement:** Version 16 or higher
**Package Manager:** Yarn (preferred over npm based on README instructions)

### Deployment Platform

**Replit Integration:**
- Configured for Replit's hosting environment (host: 0.0.0.0)
- Standard port configuration (5000)
- HTML includes placeholder for Replit badge integration