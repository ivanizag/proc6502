import {Proc6502} from '../src/cpu';
import {newBus} from '../src/bus';

test('PC increases by 1', () => {
  const proc = new Proc6502();
  const bus = newBus();

  bus.data = 0xea; // NOP
  proc.cycle(bus);
  expect(bus.address).toBe(0x0001);

  proc.cycle(bus);
  expect(bus.address).toBe(0x0001);
});

test('0xa0 LDY', () => {
  const proc = new Proc6502();
  const bus = newBus();

  bus.data = 0xa0; // LDY
  proc.cycle(bus);
  expect(bus.address).toBe(0x0001);

  bus.data = 0x34;
  proc.cycle(bus);
  expect(bus.address).toBe(0x0002);
  expect(proc.y).toBe(0x34);
});
