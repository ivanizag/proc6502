import * as fs from 'fs-extra';

import {Proc6502} from '../src/cpu';
import {newBus} from '../src/bus';
import { assert } from 'console';

// To execute test suite from https://github.com/Klaus2m5/6502_65C02_functional_tests
test('Klaus Dormann', () => {
    const proc = new Proc6502();
    const bus = newBus();
    const mem = new Uint8Array(65536);

    const binary = fs.readFileSync('test/testdata/6502_functional_test.bin');
    mem.set(binary)

    proc.pc = 0x400;
    bus.address = 0x400;

    let prevPC = proc.pc;
    let lastTest = -1;
    let cycles = 0
    while (cycles++ <100000000) {
        // RAM Access
        if (bus.isWrite) {
            mem[bus.address] = bus.data;
        } else {
            bus.data = mem[bus.address];
        }  
        
        proc.cycle(bus);

        if (!proc.midInstruction()) {
            const currentTest = mem[0x200];
            if (lastTest != currentTest) {
                lastTest = currentTest;
            }

            if (prevPC == proc.pc) {
                break;
            }
            prevPC = proc.pc;
        }
    }

    expect(lastTest).toBe(240);
    expect(cycles).toBe(96241367);

  });
  