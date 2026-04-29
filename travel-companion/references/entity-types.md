# Entity Types — Guidance

Types in this skill are **open vocabulary**. The LLM picks whatever fits
the destination; the graph renderer will colour-code unknown types with a
stable hash. Still, aim for consistency **within one trip**.

## The rule of thumb

- If two things would be treated differently by a traveler, give them
  different types.
- If they would be treated the same, collapse them.

Example (Egypt): `pharaoh` and `deity` are both "people-ish" but travelers
care about them differently (one ruled, the other was worshipped), so keep
them separate. Meanwhile `temple` and `shrine` often fold into `temple`.

## Reference buckets

### People
`person` · `pharaoh` · `emperor` · `empress` · `king` · `queen` ·
`general` · `artist` · `architect` · `writer` · `philosopher` ·
`explorer` · `deity` · `saint` · `monk`

### Places (these get geocoded)
`place` · `city` · `town` · `village` · `region` · `district` · `site` ·
`ruin` · `temple` · `church` · `mosque` · `shrine` · `palace` · `museum` ·
`gallery` · `landmark` · `monument` · `tomb` · `natural_feature` ·
`mountain` · `river` · `lake` · `sea` · `desert` · `island` · `park` ·
`market` · `neighborhood` · `station` · `port`

### Time
`event` · `battle` · `discovery` · `treaty` · `era` · `period` ·
`dynasty` · `kingdom`

### Culture
`cuisine` · `dish` · `drink` · `artwork` · `artifact` · `myth` ·
`legend` · `religion` · `concept` · `festival` · `ritual` · `craft` ·
`style`

### Meta
`itinerary` · `tip` · `warning` — used rarely, for traveler-facing notes.

## Which types get coords?

`geocode.py` considers a type geocodable if it is in this set (kept in
sync with the script):

```
place city town village region district site ruin temple church mosque
shrine palace museum gallery landmark monument tomb natural_feature
mountain river lake sea desert island park market neighborhood station
port
```

If you invent a new location type, either:
1. Name it so the prefix/suffix matches (e.g. `hot_spring_site`), or
2. Set `coords` directly in the extraction JSON.
