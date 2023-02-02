import {Bus} from './bus';

export interface CpuState {
  pc: number;
  sp: number;
  a: number;
  x: number;
  y: number;
  p: number;

  v: number;
  w: number;

  opcode: number;
  steps: CpuAction[];
  step: number;
  yield: boolean;
  trace: boolean;
}

const flagN = 1 << 7;
const flagV = 1 << 6;
const flag5 = 1 << 5;
const flagB = 1 << 4;
const flagD = 1 << 3;
const flagI = 1 << 2;
const flagZ = 1 << 1;
const flagC = 1 << 0;

function setFlag(s: CpuState, flag: number) {
  s.p |= flag;
}

function clearFlag(s: CpuState, flag: number) {
  s.p &= ~flag;
}

function updateFlag(s: CpuState, flag: number, value: boolean) {
  if (value) {
    setFlag(s, flag);
  } else {
    clearFlag(s, flag);
  }
}

export function newCpuState(): CpuState {
  return {
    pc: 0,
    sp: 0,
    a: 0,
    x: 0,
    y: 0,
    p: 0,
    v: 0,
    w: 0,
    opcode: 0,
    steps: [],
    step: 0,
    yield: false,
    trace: false,
  };
}

enum Mode {
  Implicit,
  Immediate,
  ZeroPage,
  Absolute,
}

interface Instruction {
  name: string;
  mode: Mode;
  steps: CpuAction[];
}

const incByte = (v: number) => (v + 1) % 256;
const incWord = (v: number) => (v + 1) % 65536;

export type CpuAction = (state: CpuState, bus: Bus) => void;

export function cycle(state: CpuState, bus: Bus) {
  if (!state.steps.length) {
    opDecode(state, bus);
    if (state.trace) console.log('Decoded', state, bus);
  }

  while (!state.yield && state.step < state.steps.length) {
    state.steps[state.step](state, bus);
    state.step++;
    if (state.trace) console.log('Step', state, bus);
  }

  if (!state.yield) {
    state.steps = [];
    tr_pc_ba(state, bus);
    if (state.trace) console.log('Next operation', state, bus);
  }

  state.yield = false;

  if (state.trace) console.log('yield');
}

const opDecode: CpuAction = (s, b) => {
  s.opcode = b.data;
  s.steps = instructions[s.opcode].steps;
  s.step = 0;
  s.pc = incWord(s.pc);
};

// Transfers
const inc_pc: CpuAction = (s, _) => {
  s.pc = incWord(s.pc);
};

const tr_pc_ba: CpuAction = (s, b) => {
  b.address = s.pc;
  s.yield = true;
};
const tr_v_ba: CpuAction = (s, b) => {
  b.address = s.v;
  s.yield = true;
};
const tr_w_ba: CpuAction = (s, b) => {
  b.address = s.w;
  s.yield = true;
};

const tr_bd_v: CpuAction = (s, b) => {
  s.v = b.data;
};
const tr_bd_v_w: CpuAction = (s, b) => {
  s.w = s.v + (b.data << 8);
};
const tr_v_a: CpuAction = (s, _) => {
  s.a = s.v;
};
const tr_v_x: CpuAction = (s, _) => {
  s.x = s.v;
};
const tr_v_y: CpuAction = (s, _) => {
  s.y = s.v;
};

const op_yield: CpuAction = (s, _) => {
  s.yield = true;
};

// Flags
const fl_ZN: CpuAction = (s, _) => {
  updateFlag(s, flagZ, s.v === 0);
  updateFlag(s, flagN, s.v >= 1 << 7);
};

const group_immediate = [tr_pc_ba, inc_pc, tr_bd_v, fl_ZN];
const group_zeropage = [tr_pc_ba, inc_pc, tr_bd_v, tr_v_ba, tr_bd_v, fl_ZN];
const group_absolute = [
  tr_pc_ba,
  inc_pc,
  tr_bd_v,
  tr_pc_ba,
  inc_pc,
  tr_bd_v_w,
  tr_w_ba,
  tr_bd_v,
  fl_ZN,
];

function Inst(name: string, mode: Mode, steps: CpuAction[]): Instruction {
  return {name, mode, steps};
}

// TODO: remove this expport once completed.
export const instructions: {[id: number]: Instruction} = {
  0xea: Inst('NOP', Mode.Implicit, [tr_pc_ba]),
  0xa9: Inst('LDA', Mode.Immediate, [...group_immediate, tr_v_a]),
  0xa2: Inst('LDX', Mode.Immediate, [...group_immediate, tr_v_x]),
  0xa0: Inst('LDY', Mode.Immediate, [...group_immediate, tr_v_y]),
  0xa5: Inst('LDA', Mode.ZeroPage, [...group_zeropage, tr_v_a]),
  0xa6: Inst('LDX', Mode.ZeroPage, [...group_zeropage, tr_v_x]),
  0xa4: Inst('LDY', Mode.ZeroPage, [...group_zeropage, tr_v_y]),
  0xad: Inst('LDA', Mode.Absolute, [...group_absolute, tr_v_a]),
  0xae: Inst('LDX', Mode.Absolute, [...group_absolute, tr_v_x]),
  0xac: Inst('LDY', Mode.Absolute, [...group_absolute, tr_v_y]),
};
