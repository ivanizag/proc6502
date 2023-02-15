import * as fs from 'fs-extra';

import {CpuState, cycle, newCpuState, instructions} from '../src/cpu';
import {Bus} from '../src/bus';

const ProcessorTestsPath = '../ProcessorTests/6502/v1/';

interface TestState {
  pc: number;
  s: number;
  a: number;
  x: number;
  y: number;
  p: number;
  ram: number[][];
}

interface Scenario {
  name: string;
  initial: TestState;
  final: TestState;
  cycles: (number | string)[][];
}

function loadTestData(opcode: string): Scenario[] {
  const filename = ProcessorTestsPath + opcode + '.json';
  const content = fs.readFileSync(filename, 'utf-8');
  return JSON.parse(content) as Scenario[];
}

export function runHarteSuiteRange(start: number, end: number) {
  const an_opcode = -1;
  const single = an_opcode !== -1;

  for (let opcode = start; opcode < end; opcode++) {
    if ((opcode in instructions && !single) || opcode === an_opcode) {
      const opcodeText = opcode.toString(16).toLowerCase().padStart(2, '0');
      describe(`Harte 6502 Test 0x${opcodeText}`, () => {
        const scenarios: [string, Scenario][] = loadTestData(opcodeText)
          .slice(0, 1000)
          .map(s => [s.name, s]);

        test.each(scenarios)('%s', (name, scenario: Scenario) => {
          runScenario(scenario, single);
        });
      });
    }
  }
}

function runScenario(scenario: Scenario, log: boolean) {
  const state: CpuState = {
    ...newCpuState(),
    pc: scenario.initial.pc,
    sp: scenario.initial.s,
    a: scenario.initial.a,
    x: scenario.initial.x,
    y: scenario.initial.y,
    p: scenario.initial.p,
  };
  const bus: Bus = {
    address: state.pc,
    data: 0,
    isWrite: false,
  };
  let ram = scenario.initial.ram;

  const receivedCycles: (number | string)[][] = [];

  for (let step = 0; step < scenario.cycles.length; step++) {
    // RAM Access
    if (bus.isWrite) {
      ram = [[bus.address, bus.data], ...ram];
    } else {
      bus.data = (ram.find(v => v[0] === bus.address) || [0])[1];
    }
    receivedCycles.push([bus.address, bus.data, bus.isWrite ? 'write' : 'read']);
    // CPU step
    cycle(state, bus);
  }

  if (log) {
    console.log(scenario);
    console.log(receivedCycles);
    console.log(scenario.cycles);
  }

  // Check correct cycle count
  expect(state.steps.length).toBe(0);

  // Check cycles
  expect(receivedCycles).toStrictEqual(scenario.cycles);

  // Check final state
  expect(state.pc).toBe(scenario.final.pc);
  expect(state.sp).toBe(scenario.final.s);
  expect(state.a).toBe(scenario.final.a);
  expect(state.x).toBe(scenario.final.x);
  expect(state.y).toBe(scenario.final.y);
  expect(state.p).toBe(scenario.final.p);

  // Check final ram
  scenario.final.ram.forEach(pair => {
    const value = (ram.find(v => v[0] === pair[0]) || [0])[1];
    expect(value).toBe(pair[1]);
  });
}