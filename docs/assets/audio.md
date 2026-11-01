# Audio credits

Ambient and narration audio shipped with the site. Rules: ADR 0003 and 0013 (licences), ADR 0005 (narration). Every BY/NC asset needs author, link, licence and a "modified" note.

## Ambient forest soundscape (P3-T05, issue #29)

Files: `public/audio/ambient/forest-night.ogg` (Vorbis, 96 kbps) and `public/audio/ambient/forest-night.m4a` (AAC, 80 kbps). Both 60.0 s, stereo, 44.1 kHz, seamless loop. Total size 1.32 MB (limit 1.5 MB).

**Selected source (top pick)**

- Title: "Small wood at night close to Rio de Janeiro (on the way to Pedra Bonita)"
- Author: `felix.blume`
- URL: https://freesound.org/people/felix.blume/sounds/410357/
- Licence: Freesound page reads "Creative Commons 0" (`http://creativecommons.org/publicdomain/zero/1.0/`). No attribution is required by the licence; credited here anyway.
- Original: 4:22.5 WAV, 96 kHz, 24-bit, stereo (144.2 MB). Not downloaded: the original download needs a Freesound login. The source used is the public Freesound HQ preview MP3 of the same full-length recording (128 kbps MP3, 4:22.5).
- Content per uploader description: crickets, light wind through the trees with creaking wood, a few occasional birds. No traffic, voices, water or dogs listed. Spectrogram check (Freesound's public image): repeated high-frequency insect bands and broadband wind; no clear bird-song chirp patterns seen.
- Sampling from other works: none stated on the page.

**Modifications**

1. Cut 60 s from the preview (start 0:60).
2. Made a seamless loop: the last 3 s were crossfaded into the first 3 s (tri curves) and the loop is 60 s long.
3. Transcoded to Vorbis (OGG) and AAC (M4A) with ffmpeg. No EQ, no gain change, no other layers.

**Not used, with reasons (for the record)**

- `844067` "Calmont – Wide Valley Ambience from the Moselhöhenweg" (`TSP-Talk`, CC0): rejected, distant road traffic is modern.
- `517859` "Forest" (`Antonio_Lai`, CC0, 48 s): backup. Wind, birds, insects and grazing animals; birds and livestock are not wanted.
- `872852` "Cicada Swarm Virginia 2021 with Birds and Wind Ambience" (`loganzsound`, CC0, 85 s): rejected, birds in the mix and a street background.
- `698308` "New England Forest with Soft Rain Morning Ambience" (`Bmisiewicz`, "Attribution 4.0", CC-BY-4.0, 3:15): backup for a rain layer. Rain is not in the brief.
- `849627` "Wind in Pine Trees, Soft Rustle, Slaley Forest, ORTF Stereo" (`Hear_it_use_it`, "Attribution 4.0", CC-BY-4.0, 19:47): backup for a wind-only layer. The page says faint distant birdsong can be heard in lulls.
- `28646` "Forest Ambience Danish.wav" (`gim-audio`, "Attribution 3.0", CC-BY-3.0): rejected, "lots of birds etc." (modern songbirds).
- `613262` "ambient-forest-loop.wav" (`TobyNT-SFX`, "Attribution 4.0", CC-BY-4.0): rejected, tagged birds, unverified seam.
- `386869` "Ambience_Forest.wav" (`ConnorM94`, "Attribution 3.0"): rejected, birds only, 10 s.
- `696508` "quiet_wind1.wav" (`BeroundSound`, CC0): rejected, 8 kHz source, 27 s, unclear content.

**Limits**

- No human has listened to the final loop. Content was checked from the uploader description and the spectrogram only. A human should listen once for stray birdsong or a seam click before release.
- Search used public Freesound web pages (no API token). Searches on general web sources (commercial libraries) were not licence-compatible and were skipped.
