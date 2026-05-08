import type { ThreadEvent, SerializeFormat, SerializerOptions } from "./types.js";

function serializeEventJson(event: ThreadEvent, pretty: boolean): string {
  return pretty ? JSON.stringify(event, null, 2) : JSON.stringify(event);
}

function serializeEventXml(event: ThreadEvent, includeTimestamps: boolean): string {
  const tag = (typeof event.data === "object" && event.data?.intent) || event.type;
  const lines: string[] = [];

  if (typeof event.data !== "object" || event.data === null) {
    lines.push(`<${tag}>${String(event.data)}</${tag}>`);
  } else {
    lines.push(`<${tag}>`);
    for (const [key, value] of Object.entries(event.data)) {
      if (key === "intent") continue;
      const display = typeof value === "object" ? JSON.stringify(value) : String(value);
      lines.push(`  ${key}: ${display}`);
    }
    if (includeTimestamps && event.timestamp) {
      lines.push(`  timestamp: ${new Date(event.timestamp).toISOString()}`);
    }
    lines.push(`</${tag}>`);
  }

  return lines.join("\n");
}

function serializeEventMarkdown(event: ThreadEvent): string {
  const tag = (typeof event.data === "object" && event.data?.intent) || event.type;
  const lines: string[] = [`### ${tag}`];

  if (typeof event.data !== "object" || event.data === null) {
    lines.push(String(event.data));
  } else {
    for (const [key, value] of Object.entries(event.data)) {
      if (key === "intent") continue;
      const display = typeof value === "object" ? JSON.stringify(value) : String(value);
      lines.push(`- **${key}**: ${display}`);
    }
  }

  return lines.join("\n");
}

export function serializeEvents(
  events: ThreadEvent[],
  options: SerializerOptions = { format: "json" }
): string {
  const { format, pretty = false, includeTimestamps = false } = options;

  switch (format) {
    case "json":
      if (pretty) {
        return JSON.stringify(events, null, 2);
      }
      return JSON.stringify(events);

    case "xml":
      return events
        .map((e) => serializeEventXml(e, includeTimestamps))
        .join("\n");

    case "markdown":
      return events.map(serializeEventMarkdown).join("\n\n");

    default:
      return JSON.stringify(events);
  }
}

export type { SerializeFormat, SerializerOptions };
