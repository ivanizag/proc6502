import {cycle, newCpuState} from '../src/cpu';
import {newBus} from '../src/bus';

test('PC increases by 1', () => {
  const state = newCpuState();
  const bus = newBus();

  bus.data = 0xea; // NOP
  cycle(state, bus);
  expect(bus.address).toBe(0x0001);

  cycle(state, bus);
  expect(bus.address).toBe(0x0001);
});

test('0xa0 LDY', () => {
  const state = newCpuState();
  const bus = newBus();

  bus.data = 0xa0; // LDY
  cycle(state, bus);
  expect(bus.address).toBe(0x0001);

  bus.data = 0x34;
  cycle(state, bus);
  expect(bus.address).toBe(0x0002);
  expect(state.y).toBe(0x34);
});
