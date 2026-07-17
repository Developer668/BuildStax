# BuildStax

BuildStax is an agentic service for finding businesses without websites,
selling them a website or landing page, and delivering it through a managed
email feedback loop.

This repository currently captures the product architecture and operating
constraints. It does not yet contain a runnable application or configured
external integrations.

## Product Flow

1. Agents identify businesses that do not have websites.
2. An agent calls and pitches the service; pitch outcomes improve future calls.
3. The system sells the website, gathers requirements, and sends a follow-up
   email with cost and details.
4. After payment, an underlying agent builds the website or landing page.
5. The generated site is sent to the customer.
6. The customer can request changes in a continuous email thread until the
   deliverable is complete.

## Architecture

- **0.xyz** orchestrates agents and selects calling and mail providers.
- **Nexla** is the proposed data layer and persistent-memory system.
- **Pomerium** is the proposed safety layer for access control, data integrity,
  and prompt-injection protection.
- **OpenAI GPT Realtime / ChatGPT voice** powers natural phone conversations.
- **Codex** may be used by the platform-side build agent; customers should not
  need to connect their own Codex account.

The build agent must operate in a properly isolated environment. It may need
substantial system access to create sites, so untrusted business content and
prompt-injection attempts must not be able to take over its execution context.

## Design Record

The complete cleaned transcript, original handwritten flowchart, and searchable
Mermaid reconstruction are in
[buildstax-system-transcript.md](buildstax-system-transcript.md).

## Development Guidance

Read [AGENTS.md](AGENTS.md) before adding integrations or changing access
controls. It documents the required discovery, credential, Nexla, AkashML, and
Pomerium safeguards.
