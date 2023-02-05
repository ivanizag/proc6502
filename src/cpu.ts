import {Bus} from './bus';

export interface CpuState {
  pc: number;
  sp: number;
  a: number;
  x: number;
  y: number;
  p: number;

  v: number;
  v2: number;
  w: number;
  wlo: number;
  w_carry: boolean;

  opcode: number;
  steps: CpuAction[];
  step: number;
  yield: boolean;
  trace: boolean;
}

const flagN = 1 << 7;
//const flagV = 1 << 6;
//const flag5 = 1 << 5;
//const flagB = 1 << 4;
//const flagD = 1 << 3;
//const flagI = 1 << 2;
const flagZ = 1 << 1;
//const flagC = 1 << 0;

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
    v2: 0,
    w: 0,
    wlo: 0,
    w_carry: false,
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
  ZeroPageX,
  ZeroPageY,
  Absolute,
  AbsoluteX,
  AbsoluteY,
  IndexedIndirectX,
  IndirectIndexedY,
}

interface Instruction {
  name: string;
  mode: Mode;
  steps: CpuAction[];
}

const incByte = (v: number) => (v + 1) & 0xff;
const incWord = (v: number) => (v + 1) & 0xffff;

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
    tr_pc_w(state, bus);
    yield_read(state, bus);
    if (state.trace) console.log('Next operation', state, bus);
  }

  state.yield = false;

  if (state.trace) console.log('yield');
}

const opDecode: CpuAction = (s, b) => {
  s.opcode = b.data;
  if (!instructions[s.opcode]) {
    console.log('Missing opcode: 0x' + s.opcode.toString(16));
    return; //TODO
  }
  s.steps = instructions[s.opcode].steps;
  s.step = 0;
  s.pc = incWord(s.pc);
};

const inc_pc: CpuAction = s => {
  s.pc = incWord(s.pc);
};
const inc_w: CpuAction = s => {
  s.w = incWord(s.w);
};

const yield_read: CpuAction = (s, b) => {
  b.address = s.w;
  b.isWrite = false;
  s.yield = true;
};
const yield_write: CpuAction = (s, b) => {
  b.address = s.w;
  b.isWrite = true;
  s.yield = true;
};

const load_v: CpuAction = (s, b) => {
  s.v = b.data;
};
const store_v: CpuAction = (s, b) => {
  b.data = s.v;
};

const tr_v_a: CpuAction = s => {
  s.a = s.v;
};
const tr_a_v: CpuAction = s => {
  s.v = s.a;
};
const tr_v_x: CpuAction = s => {
  s.x = s.v;
};
const tr_x_v: CpuAction = s => {
  s.v = s.x;
};
const tr_v_y: CpuAction = s => {
  s.y = s.v;
};
const tr_y_v: CpuAction = s => {
  s.v = s.y;
};
const tr_pc_w: CpuAction = s => {
  s.w = s.pc;
};
const tr_v_w: CpuAction = s => {
  s.w = s.v;
};
const tr_v_v2: CpuAction = s => {
  s.v2 = s.v;
};
const tr_v_v2hi: CpuAction = s => {
  s.v2 = (s.v2 & 0xff) + (s.v << 8);
};
const tr_v2_w: CpuAction = s => {
  s.w = s.v2;
};

const add_x_w: CpuAction = (s, b) => {
  const result = (s.w + s.x) & 0xffff;
  s.w = (s.w & 0xff00) + ((s.w + s.x) & 0xff);
  if (s.w !== result) {
    // page boundary crossed
    s.w_carry = true;
    yield_read(s, b);
  }
};

const add_y_w: CpuAction = (s, b) => {
  const result = (s.w + s.y) & 0xffff;
  s.w = (s.w & 0xff00) + ((s.w + s.y) & 0xff);
  if (s.w !== result) {
    // page boundary crossed
    s.w_carry = true;
    yield_read(s, b);
  }
};

const no_carry_optimization: CpuAction = (s, b) => {
  if (!s.w_carry) {
    // Loose a cycle anyway
    yield_read(s, b);
  }
};

const add_w_carry: CpuAction = s => {
  if (s.w_carry) {
    s.w = (s.w + 0x100) & 0xffff;
  }
};

const add_v_w_lo: CpuAction = s => {
  s.w = (s.w + s.v) & 0xff;
};

// Flags
const fl_ZN: CpuAction = s => {
  updateFlag(s, flagZ, s.v === 0);
  updateFlag(s, flagN, s.v >= 1 << 7);
};

// Reoad or write using w, v and v2
const group_load = [yield_read, load_v, fl_ZN];
const group_write = [store_v, yield_write];

const group_load_v2 = [yield_read, load_v, tr_v_v2, inc_w, yield_read, load_v, tr_v_v2hi];
const group_param_lo_to_w = [tr_pc_w, inc_pc, yield_read, load_v, tr_v_w];
const group_param_to_w = [tr_pc_w, inc_pc, inc_pc, ...group_load_v2, tr_v2_w];

const group_immediate = [tr_pc_w, inc_pc];
const group_zeropage = [...group_param_lo_to_w];
const group_zeropageX = [...group_param_lo_to_w, yield_read, tr_x_v, add_v_w_lo];
const group_zeropageY = [...group_param_lo_to_w, yield_read, tr_y_v, add_v_w_lo];
const group_absolute = [...group_param_to_w];
const group_absoluteX = [...group_param_to_w, add_x_w, add_w_carry];
const group_absoluteY = [...group_param_to_w, add_y_w, add_w_carry];
const group_absoluteXSlow = [...group_param_to_w, add_x_w, no_carry_optimization, add_w_carry];
const group_absoluteYSlow = [...group_param_to_w, add_y_w, no_carry_optimization, add_w_carry];

function Inst(name: string, mode: Mode, steps: CpuAction[]): Instruction {
  return {name, mode, steps};
}

// TODO: remove this expport once completed.
export const instructions: {[id: number]: Instruction} = {
  0xea: Inst('NOP', Mode.Implicit, [tr_pc_w, yield_read]),

  0xa9: Inst('LDA', Mode.Immediate, [...group_immediate, ...group_load, tr_v_a]),
  0xa5: Inst('LDA', Mode.ZeroPage, [...group_zeropage, ...group_load, tr_v_a]),
  0xb5: Inst('LDA', Mode.ZeroPageX, [...group_zeropageX, ...group_load, tr_v_a]),
  0xad: Inst('LDA', Mode.Absolute, [...group_absolute, ...group_load, tr_v_a]),
  0xbd: Inst('LDA', Mode.AbsoluteX, [...group_absoluteX, ...group_load, tr_v_a]),
  0xb9: Inst('LDA', Mode.AbsoluteY, [...group_absoluteY, ...group_load, tr_v_a]),
  //0xa1: Inst('LDA', Mode.IndexedIndirectX, [...group_indexed_indirectX, tr_v_a,]),
  //0xb1: Inst('LDA', Mode.IndirectIndexedY, [...group_indirect_indexedY, tr_v_a]),
  0xbe: Inst('LDX', Mode.AbsoluteY, [...group_absoluteY, ...group_load, tr_v_x]),
  0xa2: Inst('LDX', Mode.Immediate, [...group_immediate, ...group_load, tr_v_x]),
  0xa6: Inst('LDX', Mode.ZeroPage, [...group_zeropage, ...group_load, tr_v_x]),
  0xb6: Inst('LDX', Mode.ZeroPageY, [...group_zeropageY, ...group_load, tr_v_x]),
  0xae: Inst('LDX', Mode.Absolute, [...group_absolute, ...group_load, tr_v_x]),
  0xa0: Inst('LDY', Mode.Immediate, [...group_immediate, ...group_load, tr_v_y]),
  0xa4: Inst('LDY', Mode.ZeroPage, [...group_zeropage, ...group_load, tr_v_y]),
  0xb4: Inst('LDY', Mode.ZeroPageX, [...group_zeropageX, ...group_load, tr_v_y]),
  0xac: Inst('LDY', Mode.Absolute, [...group_absolute, ...group_load, tr_v_y]),
  0xbc: Inst('LDY', Mode.AbsoluteX, [...group_absoluteX, ...group_load, tr_v_y]),

  0x85: Inst('STA', Mode.ZeroPage, [...group_zeropage, tr_a_v, ...group_write]),
  0x95: Inst('STA', Mode.ZeroPageX, [...group_zeropageX, tr_a_v, ...group_write]),
  0x8d: Inst('STA', Mode.Absolute, [...group_absolute, tr_a_v, ...group_write]),
  0x9d: Inst('STA', Mode.AbsoluteX, [...group_absoluteXSlow, tr_a_v, ...group_write]),
  0x99: Inst('STA', Mode.AbsoluteY, [...group_absoluteYSlow, tr_a_v, ...group_write]),
  //0x81: Inst('STA', Mode.IndexedIndirectX, [...group_, tr_a_v, ...group_write]),
  //0x91: Inst('STA', Mode.IndirectIndexedY, [...group_, tr_a_v, ...group_write]),
  0x86: Inst('STX', Mode.ZeroPage, [...group_zeropage, tr_x_v, ...group_write]),
  0x96: Inst('STX', Mode.ZeroPageY, [...group_zeropageY, tr_x_v, ...group_write]),
  0x8e: Inst('STX', Mode.Absolute, [...group_absolute, tr_x_v, ...group_write]),
  0x84: Inst('STY', Mode.ZeroPage, [...group_zeropage, tr_y_v, ...group_write]),
  0x94: Inst('STY', Mode.ZeroPageX, [...group_zeropageX, tr_y_v, ...group_write]),
  0x8c: Inst('STY', Mode.Absolute, [...group_absolute, tr_y_v, ...group_write]),
};
