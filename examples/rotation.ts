let speed = 2;
on(switch, "click", () => {
  motor.start();
});
onFrame((time) => {
  rotor.rotate_y(speed * time);
});
//# sourceMappingURL=rotation.ts.map
