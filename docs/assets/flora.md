# Flora assets

All Hell Creek flora is **procedural** (generated in `src/world/vegetation.ts`); no third-party meshes or textures are used, so there are no external credits to record. This was chosen over sourcing CC0/CC-BY models because instanced, wind-animated cards need vertex attributes (`bend`, `part`) that downloaded models lack, and nothing has to be streamed. `public/models/flora/` is intentionally unused. If a sourced model is added later, list its author, licence and URL here.

| Species | Group (ADR 0002) | Real-world basis | Geometry |
|---|---|---|---|
| Fern | ferns | Hell Creek understory ferns (e.g. Gleicheniaceae/Osmundaceae types) | 8 arching pinnate fronds, alpha-cut leaflets |
| Cycad | cycads | Stout-trunked cycadeoid rosette | short trunk + 13 stiff fronds |
| Conifer | conifers | *Metasequoia*-like deciduous conifer | straight trunk, 9-tier conical crown, up to ~26 m |
| Shrub | early angiosperms | Magnoliid-like broad-leaved shrub | thin stems with ovate leaves, no flowers |

No grass, no palms, no flowers. Counts: `BUDGETS[tier]` (ADR 0010); shrubs are 10 % of the fern budget.
