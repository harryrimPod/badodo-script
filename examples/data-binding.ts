let temperature = 25;
let pressure = 101;
bind(() => temperature, gauge_temperature, "value");
bind(() => pressure, gauge_pressure, "value");
watch(() => temperature, (value) => {
  if (value > 80) {
    alarm.on();
  } else {
    alarm.off();
  }
});
//# sourceMappingURL=data-binding.ts.map
