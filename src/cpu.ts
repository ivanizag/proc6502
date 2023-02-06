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
  w_carry: boolean;

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
    v2: 0,
    w: 0,
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
  Indirect,
  IndexedIndirectX,
  IndirectIndexedY,
}

interface Instruction {
  name: string;
  mode: Mode;
  steps: CpuAction[];
}

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
  s.w_carry = false;
  s.pc = incWord(s.pc);
};

const inc_pc: CpuAction = s => {
  s.pc = incWord(s.pc);
};
const inc_w: CpuAction = s => {
  s.w = incWord(s.w);
};
const inc_w_no_cross_page: CpuAction = s => {
  s.w = (s.w & 0xff00) + ((s.w + 1) & 0xff);
};
const page_zero: CpuAction = s => {
  s.w = s.w & 0xff;
};

// Bus interaction
const yield_read: CpuAction = (s, b) => {
  b.address = s.w;
  b.isWrite = false;
  s.yield = true;
};
const load_v: CpuAction = (s, b) => {
  s.v = b.data;
};
const read = [yield_read, load_v];

const write: CpuAction = (s, b) => {
  b.data = s.v;
  b.address = s.w;
  b.isWrite = true;
  s.yield = true;
};

// Transfers
const to_a: CpuAction = s => {
  s.a = s.v;
};
const to_x: CpuAction = s => {
  s.x = s.v;
};
const to_y: CpuAction = s => {
  s.y = s.v;
};
const to_sp: CpuAction = s => {
  s.sp = s.v;
};
const to_pc_lo: CpuAction = s => {
  s.pc = (s.pc & 0xff00) + s.v;
};
const to_pc_hi: CpuAction = s => {
  s.pc = (s.v << 8) + (s.pc & 0xff);
};

const from_a: CpuAction = s => {
  s.v = s.a;
};
const from_x: CpuAction = s => {
  s.v = s.x;
};
const from_y: CpuAction = s => {
  s.v = s.y;
};
const from_sp: CpuAction = s => {
  s.v = s.sp;
};
const from_pc_lo: CpuAction = s => {
  s.v = s.pc & 0xff;
};
const from_pc_hi: CpuAction = s => {
  s.v = s.pc >> 8;
};

const tr_p_v: CpuAction = s => {
  s.v = s.p | (flag5 + flagB);
};
const tr_v_p: CpuAction = s => {
  s.p = (s.v | flag5) & ~flagB;
};

const tr_pc_w: CpuAction = s => {
  s.w = s.pc;
};
const tr_w_pc: CpuAction = s => {
  s.pc = s.w;
};

const tr_sp_w: CpuAction = s => {
  s.w = s.sp + 0x100;
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

const add_v_w: CpuAction = (s, b) => {
  const result = (s.w + s.v) & 0xffff;
  s.w = (s.w & 0xff00) + ((s.w + s.v) & 0xff);
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

const tr_push_w: CpuAction = s => {
  s.w = 0x100 + s.sp;
  s.sp = (s.sp - 1) & 0xff;
};

const tr_pull_w: CpuAction = s => {
  s.sp = (s.sp + 1) & 0xff;
  s.w = 0x100 + s.sp;
};

const buildSetFlag = (flag: number) => {
  const op: CpuAction = s => {
    setFlag(s, flag);
  };
  return op;
};

const buildClearFlag = (flag: number) => {
  const op: CpuAction = s => {
    clearFlag(s, flag);
  };
  return op;
};

// Flags
const fl_ZN: CpuAction = s => {
  updateFlag(s, flagZ, s.v === 0);
  updateFlag(s, flagN, s.v >= 1 << 7);
};

const dummy_cycle = [tr_pc_w, ...read];
const dummy_sp_cycle = [tr_sp_w, ...read];

const push = [tr_push_w, write];
const pull = [tr_pull_w, ...read];
const push_pc = [...dummy_sp_cycle, from_pc_hi, ...push, from_pc_lo, ...push];
const pull_pc = [...dummy_sp_cycle, ...pull, to_pc_lo, ...pull, to_pc_hi, ...dummy_cycle];

const load_v2_hi = [...read, tr_v_v2];
const load_v2_lo = [...read, tr_v_v2hi, tr_v2_w];
const load_w_no_cross_page = [...load_v2_hi, inc_w_no_cross_page, ...load_v2_lo];
const load_w_page_zero = [...load_v2_hi, inc_w, page_zero, ...load_v2_lo];

const param_zp_to_w = [tr_pc_w, inc_pc, ...read, tr_v_w];
const param_to_w = [tr_pc_w, inc_pc, ...load_v2_hi, tr_pc_w, inc_pc, ...load_v2_lo];

const mode_immediate = [tr_pc_w, inc_pc];
const mode_zeropage = [...param_zp_to_w];
const mode_zeropageX = [...param_zp_to_w, ...read, from_x, add_v_w_lo];
const mode_zeropageY = [...param_zp_to_w, ...read, from_y, add_v_w_lo];
const mode_absolute = [...param_to_w];
const mode_absoluteX = [...param_to_w, from_x, add_v_w, add_w_carry];
const mode_absoluteY = [...param_to_w, from_y, add_v_w, add_w_carry];
const mode_absoluteXSlow = [...param_to_w, from_x, add_v_w, no_carry_optimization, add_w_carry];
const mode_absoluteYSlow = [...param_to_w, from_y, add_v_w, no_carry_optimization, add_w_carry];
const mode_indirect = [...param_to_w, ...load_w_no_cross_page];
const mode_indexed_indirectX = [...param_zp_to_w, ...read, from_x, add_v_w_lo, ...load_w_page_zero];
const mode_indirect_indexedY = [...param_zp_to_w, ...load_w_page_zero, from_y, add_v_w, add_w_carry];
const mode_indirect_indexedYSlow = [
  ...param_zp_to_w,
  ...load_w_page_zero,
  from_y,
  add_v_w,
  no_carry_optimization,
  add_w_carry,
];

const opJSR = [tr_pc_w, inc_pc, ...load_v2_hi, ...push_pc, tr_pc_w, inc_pc, ...load_v2_lo];
const opRTS = [...dummy_cycle, ...pull_pc, inc_pc];

function Inst(name: string, mode: Mode, steps: CpuAction[]): Instruction {
  return {name, mode, steps};
}

// TODO: remove this expport once completed.
export const instructions: {[id: number]: Instruction} = {
  0xea: Inst('NOP', Mode.Implicit, [...dummy_cycle]),

  0xa9: Inst('LDA', Mode.Immediate, [...mode_immediate, ...read, fl_ZN, to_a]),
  0xa5: Inst('LDA', Mode.ZeroPage, [...mode_zeropage, ...read, fl_ZN, to_a]),
  0xb5: Inst('LDA', Mode.ZeroPageX, [...mode_zeropageX, ...read, fl_ZN, to_a]),
  0xad: Inst('LDA', Mode.Absolute, [...mode_absolute, ...read, fl_ZN, to_a]),
  0xbd: Inst('LDA', Mode.AbsoluteX, [...mode_absoluteX, ...read, fl_ZN, to_a]),
  0xb9: Inst('LDA', Mode.AbsoluteY, [...mode_absoluteY, ...read, fl_ZN, to_a]),
  0xa1: Inst('LDA', Mode.IndexedIndirectX, [...mode_indexed_indirectX, ...read, fl_ZN, to_a]),
  0xb1: Inst('LDA', Mode.IndirectIndexedY, [...mode_indirect_indexedY, ...read, fl_ZN, to_a]),
  0xbe: Inst('LDX', Mode.AbsoluteY, [...mode_absoluteY, ...read, fl_ZN, to_x]),
  0xa2: Inst('LDX', Mode.Immediate, [...mode_immediate, ...read, fl_ZN, to_x]),
  0xa6: Inst('LDX', Mode.ZeroPage, [...mode_zeropage, ...read, fl_ZN, to_x]),
  0xb6: Inst('LDX', Mode.ZeroPageY, [...mode_zeropageY, ...read, fl_ZN, to_x]),
  0xae: Inst('LDX', Mode.Absolute, [...mode_absolute, ...read, fl_ZN, to_x]),
  0xa0: Inst('LDY', Mode.Immediate, [...mode_immediate, ...read, fl_ZN, to_y]),
  0xa4: Inst('LDY', Mode.ZeroPage, [...mode_zeropage, ...read, fl_ZN, to_y]),
  0xb4: Inst('LDY', Mode.ZeroPageX, [...mode_zeropageX, ...read, fl_ZN, to_y]),
  0xac: Inst('LDY', Mode.Absolute, [...mode_absolute, ...read, fl_ZN, to_y]),
  0xbc: Inst('LDY', Mode.AbsoluteX, [...mode_absoluteX, ...read, fl_ZN, to_y]),

  0x85: Inst('STA', Mode.ZeroPage, [...mode_zeropage, from_a, write]),
  0x95: Inst('STA', Mode.ZeroPageX, [...mode_zeropageX, from_a, write]),
  0x8d: Inst('STA', Mode.Absolute, [...mode_absolute, from_a, write]),
  0x9d: Inst('STA', Mode.AbsoluteX, [...mode_absoluteXSlow, from_a, write]),
  0x99: Inst('STA', Mode.AbsoluteY, [...mode_absoluteYSlow, from_a, write]),
  0x81: Inst('STA', Mode.IndexedIndirectX, [...mode_indexed_indirectX, from_a, write]),
  0x91: Inst('STA', Mode.IndirectIndexedY, [...mode_indirect_indexedYSlow, from_a, write]),
  0x86: Inst('STX', Mode.ZeroPage, [...mode_zeropage, from_x, write]),
  0x96: Inst('STX', Mode.ZeroPageY, [...mode_zeropageY, from_x, write]),
  0x8e: Inst('STX', Mode.Absolute, [...mode_absolute, from_x, write]),
  0x84: Inst('STY', Mode.ZeroPage, [...mode_zeropage, from_y, write]),
  0x94: Inst('STY', Mode.ZeroPageX, [...mode_zeropageX, from_y, write]),
  0x8c: Inst('STY', Mode.Absolute, [...mode_absolute, from_y, write]),

  0xaa: Inst('TAX', Mode.Implicit, [from_a, fl_ZN, to_x, ...dummy_cycle]),
  0xa8: Inst('TAY', Mode.Implicit, [from_a, fl_ZN, to_y, ...dummy_cycle]),
  0x8a: Inst('TXA', Mode.Implicit, [from_x, fl_ZN, to_a, ...dummy_cycle]),
  0x98: Inst('TYA', Mode.Implicit, [from_y, fl_ZN, to_a, ...dummy_cycle]),
  0x9a: Inst('TXS', Mode.Implicit, [from_x, to_sp, ...dummy_cycle]),
  0xba: Inst('TSX', Mode.Implicit, [from_sp, fl_ZN, to_x, ...dummy_cycle]),

  0x4c: Inst('JMP', Mode.Absolute, [...mode_absolute, tr_w_pc]),
  0x6c: Inst('JMP', Mode.Indirect, [...mode_indirect, tr_w_pc]),
  0x20: Inst('JSR', Mode.Absolute, [...opJSR, tr_w_pc]),
  0x60: Inst('RTS', Mode.Implicit, [...opRTS]),

  0x48: Inst('PHA', Mode.Implicit, [...dummy_cycle, from_a, ...push]),
  0x08: Inst('PHP', Mode.Implicit, [...dummy_cycle, tr_p_v, ...push]),
  0x68: Inst('PLA', Mode.Implicit, [...dummy_cycle, ...dummy_sp_cycle, ...pull, fl_ZN, to_a]),
  0x28: Inst('PLP', Mode.Implicit, [...dummy_cycle, ...dummy_sp_cycle, ...pull, tr_v_p]),

  0x38: Inst('SEC', Mode.Implicit, [buildSetFlag(flagC), ...dummy_cycle]),
  0xf8: Inst('SED', Mode.Implicit, [buildSetFlag(flagD), ...dummy_cycle]),
  0x78: Inst('SEI', Mode.Implicit, [buildSetFlag(flagI), ...dummy_cycle]),
  0x18: Inst('CLC', Mode.Implicit, [buildClearFlag(flagC), ...dummy_cycle]),
  0xd8: Inst('CLD', Mode.Implicit, [buildClearFlag(flagD), ...dummy_cycle]),
  0x58: Inst('CLI', Mode.Implicit, [buildClearFlag(flagI), ...dummy_cycle]),
  0xb8: Inst('CLV', Mode.Implicit, [buildClearFlag(flagV), ...dummy_cycle]),
};
