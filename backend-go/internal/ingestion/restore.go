package ingestion

// restoreIdentities returns a copy of previous extended with remembered ids and
// the number of groups restored. Only a group without any vote from the latest
// snapshot gets one, and only with an id that no current vote holds, so a
// deliberate dictionary split keeps its new card and resolve sees no new conflict.
func restoreIdentities(b Bundle, previous map[Identity][]string, remembered map[Identity]string) (map[Identity][]string, int) {
	out := make(map[Identity][]string, len(previous))
	for k, v := range previous {
		out[k] = v
	}
	taken := map[string]bool{}
	for _, g := range b.Groups {
		for _, m := range g.Members {
			for _, id := range previous[m.Raw.Identity()] {
				taken[id] = true
			}
		}
	}
	restored := 0
	for _, g := range b.Groups {
		counts := map[string]int{}
		voted := false
		for _, m := range g.Members {
			key := m.Raw.Identity()
			voted = voted || len(previous[key]) > 0
			if id := remembered[key]; id != "" && !taken[id] {
				counts[id]++
			}
		}
		if voted || len(counts) == 0 {
			continue
		}
		best := ""
		for id, n := range counts {
			if best == "" || n > counts[best] || (n == counts[best] && id < best) {
				best = id
			}
		}
		for _, m := range g.Members {
			if key := m.Raw.Identity(); remembered[key] == best {
				out[key] = []string{best}
			}
		}
		taken[best] = true
		restored++
	}
	return out, restored
}
