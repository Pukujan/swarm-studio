class_name Style
extends RefCounted
## Combo counter and style rank (D, C, B, A, S, SS, SSS). Varied moves raise it, repeating
## the same move barely does, getting hit knocks it down, and it drains over time.

const RANKS := ["D", "C", "B", "A", "S", "SS", "SSS"]
const NEEDS := [0.0, 25.0, 60.0, 110.0, 170.0, 240.0, 320.0]
const GAINS := {"blade": 9.0, "gun": 2.5, "finish": 30.0, "rip": 20.0, "break": 45.0, "perfect": 35.0, "swap": 12.0}

var points := 0.0
var combo := 0
var combo_t := 0.0
var recent: Array = []
var decay := 1.0           # upgrades can slow the drain

func add(move: String, kind := "blade") -> void:
	var base: float = GAINS.get(kind, 8.0)
	var seen = recent.count(move)
	var mult = 1.0 if seen == 0 else (0.45 if seen == 1 else 0.15)
	points = minf(points + base * mult, NEEDS[-1] + 60.0)
	recent.append(move)
	if recent.size() > 4:
		recent.pop_front()
	if kind == "blade" or kind == "gun":
		combo += 1
		combo_t = 2.2

func hurt() -> void:
	points *= 0.45
	combo = 0
	combo_t = 0.0

func tick(delta: float) -> void:
	var lv = level()
	points = maxf(0.0, points - delta * (4.0 + lv * 3.0) * decay)
	combo_t -= delta
	if combo_t <= 0.0:
		combo = 0

func level() -> int:
	var lv = 0
	for i in NEEDS.size():
		if points >= NEEDS[i]:
			lv = i
	return lv

func rank() -> String:
	return RANKS[level()]

## Share of the way to the next rank (for the HUD's fill).
func fill() -> float:
	var lv = level()
	if lv >= NEEDS.size() - 1:
		return 1.0
	return clampf((points - NEEDS[lv]) / (NEEDS[lv + 1] - NEEDS[lv]), 0.0, 1.0)

## More XP and more orbs at higher ranks.
func mult() -> float:
	return 1.0 + level() * 0.25
