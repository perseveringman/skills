# Data Schemas

Read this when you need to query the knowledge base programmatically
(for example, when the user asks "list all temples we've mentioned").

## Entity file frontmatter

```yaml
id: string                # canonical display name, matches filename slug
type: string              # see entity-types.md
aliases: [string]
coords: [lat, lon] | null
coords_source: nominatim | user | llm | null
summary: string
tags: [string]
related: [string]         # ids of other entities
mentioned_at: [ISO8601]
created: ISO8601
updated: ISO8601
```

## graph.json

Matches Cytoscape's `elements` format:

```json
{
  "nodes": [
    {"data": {"id": "...", "type": "...", "label": "...", "coords": [lat, lon]}}
  ],
  "edges": [
    {"data": {"id": "e_123", "source": "...", "target": "...", "label": "..."}}
  ]
}
```

`coords` on nodes is copied from the entity frontmatter so the map HTML
doesn't need a separate query.

## state.json

```json
{
  "version": 1,
  "created": "ISO8601",
  "turns_ingested": 0,
  "last_ingest": "ISO8601 or null",
  "places_known": 0
}
```

## session-log.jsonl

One JSON object per line. Append-only.

```json
{"t": "ISO8601", "role": "user|assistant", "text": "..."}
```

## geocache.json

```json
{
  "卢克索神庙": {"lat": 25.7001, "lon": 32.6391, "source": "nominatim", "queried_at": "ISO8601"}
}
```
