extends StaticBody3D
## The collision shell of a pet's dome: shots from outside stop here.
var pet = null

func take_hit(_amount: float, at: Vector3, _src := "") -> bool:
	if pet and is_instance_valid(pet):
		pet.dome_hit(at)
	return false
