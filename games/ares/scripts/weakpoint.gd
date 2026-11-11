class_name Weakpoint
extends Area3D
## A glowing part of a boss that can be shot off to disable one of its attacks.

var boss = null
var wp_name := "Weak point"
var disables := ""
var hp := 140.0
var max_hp := 140.0
var size := 0.35
var broken := false
var id := 0
var orb: MeshInstance3D

func _ready() -> void:
	id = Game.new_id()
	collision_layer = 8
	collision_mask = 0
	monitoring = false
	var cs = CollisionShape3D.new()
	var s = SphereShape3D.new()
	s.radius = size * 1.6
	cs.shape = s
	add_child(cs)
	orb = Look.ball(size, Color(1.0, 0.7, 0.2), 3.0, 0.0)
	add_child(orb)

func _process(_d: float) -> void:
	if broken or orb == null:
		return
	var pulse = 1.0 + 0.18 * sin(Game.time * 10.0 + id)
	orb.scale = Vector3.ONE * pulse
	# keep the collider a constant world size under scaled bosses
	var par = get_parent() as Node3D
	var gs = par.global_transform.basis.get_scale().x if par else 1.0
	if gs > 0.001:
		scale = Vector3.ONE / gs * maxf(1.0, gs * 0.35)

func take_hit(amount: float, at: Vector3, _src := "") -> bool:
	if broken or boss == null or not is_instance_valid(boss) or boss.dead or not boss.ai:
		return false
	hp -= amount * 1.3
	Fx.number(at, amount * 1.3, Color(1.0, 0.85, 0.3))
	Fx.sparks(at, Fx.GOLD, 6, 7.0)
	Look.flash(orb, 1.0)
	if hp <= 0.0:
		broken = true
		orb.visible = false
		set_deferred("monitorable", false)
		for c in get_children():
			if c is CollisionShape3D:
				c.set_deferred("disabled", true)
		boss.weakpoint_broken(self)
	return true
