---
version: alpha
name: Muse
---

## Overview

Placeholder for Muse's visual identity. Because this repository is in first initialization, do not infer or lock a brand direction yet.

Fill this file during the first task that requires concrete UI, layout, or copy-tone decisions. Follow the Google Labs `design.md`(https://github.com/google-labs-code/design.md) format: machine-readable YAML design tokens in the front matter plus human-readable Markdown rationale in the sections below.

## Colors

TODO: Define the product palette and add matching `colors` tokens in the YAML front matter.

Required decisions:
- Primary color and role.
- Secondary or neutral palette and role.
- Surface, border, text, muted text, success, warning, and error colors if needed.
- Accessibility contrast expectations for normal text, large text, and interactive states.

## Typography

TODO: Define typography levels and add matching `typography` tokens in the YAML front matter.

Required decisions:
- Font family or families.
- Display, headline, body, label, caption, and code styles.
- Font sizes, weights, line heights, and letter spacing.

## Layout

TODO: Define layout strategy and add matching `spacing` tokens in the YAML front matter.

Required decisions:
- Page width and responsive breakpoints.
- Spacing scale.
- Grid, panel, card, and content-density rules.

## Elevation & Depth

TODO: Define how hierarchy is expressed.

Required decisions:
- Shadow, border, tonal-layer, and overlay behavior.
- Hover, focus, active, dialog, popover, and command-palette depth rules.

## Shapes

TODO: Define shape language and add matching `rounded` tokens in the YAML front matter.

Required decisions:
- Radius scale for buttons, inputs, cards, dialogs, badges, and full pills.
- Whether sharp, soft, or mixed geometry is allowed.

## Components

TODO: Define component-level tokens in the YAML front matter when the first UI task introduces real components.

Expected components:
- Buttons.
- Inputs and text areas.
- Cards and panels.
- Dialogs, popovers, command palettes, menus, and navigation.
- AI output, prompt, retry, refine, save, and provenance surfaces.

## Do's and Don'ts

- Do treat this file as a placeholder until the first concrete UI task.
- Do fill YAML tokens and Markdown rationale together when the visual system is first defined.
- Do validate with `npx @google/design.md lint DESIGN.md` after adding real tokens.
- Do map finalized tokens into Tailwind CSS v4 theme variables and shadcn/ui styling conventions.
- Don't invent colors, typography, radius, spacing, or component styling before requirements exist.
- Don't mark UI work done until this file has been filled and checked for that task.
