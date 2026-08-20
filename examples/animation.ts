on(button, "click", () => {
  door.play_animation("open");
});
on(door, "opened", () => {
  light.on();
});
//# sourceMappingURL=animation.ts.map
