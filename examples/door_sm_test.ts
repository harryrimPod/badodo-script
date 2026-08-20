let speed = 5;
let max_temperature = 80;
on(switch, "click", () => {
  motor.start();
});
if (temperature > max_temperature) {
  motor.stop();
  alarm.on();
} else {
  alarm.off();
}
//# sourceMappingURL=door_sm_test.ts.map
