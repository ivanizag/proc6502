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
const tr_v_sp: CpuAction = s => {
  s.sp = s.v;
};
const tr_sp_v: CpuAction = s => {
  s.v = s.sp;
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

// Reoad or write using w, v
const mode_read = [yield_read, load_v, fl_ZN];
const mode_write = [store_v, yield_write];

const dummy_cycle = [tr_pc_w, yield_read];
const dummy_sp_cycle = [tr_sp_w, yield_read];
const push = [...dummy_cycle, tr_push_w, store_v, yield_write];
const pull = [...dummy_cycle, ...dummy_sp_cycle, tr_pull_w, yield_read, load_v];

const mode_load_w = [yield_read, load_v, tr_v_v2, inc_w, yield_read, load_v, tr_v_v2hi, tr_v2_w];
const mode_load_w_no_cross_oage = [
  yield_read,
  load_v,
  tr_v_v2,
  inc_w_no_cross_page,
  yield_read,
  load_v,
  tr_v_v2hi,
  tr_v2_w,
];
const mode_load_w_page_zero = [yield_read, load_v, tr_v_v2, inc_w, page_zero, yield_read, load_v, tr_v_v2hi, tr_v2_w];

const mode_param_lo_to_w = [tr_pc_w, inc_pc, yield_read, load_v, tr_v_w];
const mode_param_to_w = [tr_pc_w, inc_pc, inc_pc, ...mode_load_w];

const mode_immediate = [tr_pc_w, inc_pc];
const mode_zeropage = [...mode_param_lo_to_w];
const mode_zeropageX = [...mode_param_lo_to_w, yield_read, tr_x_v, add_v_w_lo];
const mode_zeropageY = [...mode_param_lo_to_w, yield_read, tr_y_v, add_v_w_lo];
const mode_absolute = [...mode_param_to_w];
const mode_absoluteX = [...mode_param_to_w, tr_x_v, add_v_w, add_w_carry];
const mode_absoluteY = [...mode_param_to_w, tr_y_v, add_v_w, add_w_carry];

const mode_absoluteXSlow = [...mode_param_to_w, tr_x_v, add_v_w, no_carry_optimization, add_w_carry];
const mode_absoluteYSlow = [...mode_param_to_w, tr_y_v, add_v_w, no_carry_optimization, add_w_carry];

const mode_indirect = [...mode_param_to_w, ...mode_load_w_no_cross_oage];

const mode_indexed_indirectX = [...mode_param_lo_to_w, yield_read, tr_x_v, add_v_w_lo, ...mode_load_w_page_zero];

const mode_indirect_indexedY = [...mode_param_lo_to_w, ...mode_load_w_page_zero, tr_y_v, add_v_w, add_w_carry];
const mode_indirect_indexedYSlow = [
  ...mode_param_lo_to_w,
  ...mode_load_w_page_zero,
  tr_y_v,
  add_v_w,
  no_carry_optimization,
  add_w_carry,
];

function Inst(name: string, mode: Mode, steps: CpuAction[]): Instruction {
  return {name, mode, steps};
}

// TODO: remove this expport once completed.
export const instructions: {[id: number]: Instruction} = {
  0xea: Inst('NOP', Mode.Implicit, [...dummy_cycle]),

  0xa9: Inst('LDA', Mode.Immediate, [...mode_immediate, ...mode_read, tr_v_a]),
  0xa5: Inst('LDA', Mode.ZeroPage, [...mode_zeropage, ...mode_read, tr_v_a]),
  0xb5: Inst('LDA', Mode.ZeroPageX, [...mode_zeropageX, ...mode_read, tr_v_a]),
  0xad: Inst('LDA', Mode.Absolute, [...mode_absolute, ...mode_read, tr_v_a]),
  0xbd: Inst('LDA', Mode.AbsoluteX, [...mode_absoluteX, ...mode_read, tr_v_a]),
  0xb9: Inst('LDA', Mode.AbsoluteY, [...mode_absoluteY, ...mode_read, tr_v_a]),
  0xa1: Inst('LDA', Mode.IndexedIndirectX, [...mode_indexed_indirectX, ...mode_read, tr_v_a]),
  0xb1: Inst('LDA', Mode.IndirectIndexedY, [...mode_indirect_indexedY, ...mode_read, tr_v_a]),
  0xbe: Inst('LDX', Mode.AbsoluteY, [...mode_absoluteY, ...mode_read, tr_v_x]),
  0xa2: Inst('LDX', Mode.Immediate, [...mode_immediate, ...mode_read, tr_v_x]),
  0xa6: Inst('LDX', Mode.ZeroPage, [...mode_zeropage, ...mode_read, tr_v_x]),
  0xb6: Inst('LDX', Mode.ZeroPageY, [...mode_zeropageY, ...mode_read, tr_v_x]),
  0xae: Inst('LDX', Mode.Absolute, [...mode_absolute, ...mode_read, tr_v_x]),
  0xa0: Inst('LDY', Mode.Immediate, [...mode_immediate, ...mode_read, tr_v_y]),
  0xa4: Inst('LDY', Mode.ZeroPage, [...mode_zeropage, ...mode_read, tr_v_y]),
  0xb4: Inst('LDY', Mode.ZeroPageX, [...mode_zeropageX, ...mode_read, tr_v_y]),
  0xac: Inst('LDY', Mode.Absolute, [...mode_absolute, ...mode_read, tr_v_y]),
  0xbc: Inst('LDY', Mode.AbsoluteX, [...mode_absoluteX, ...mode_read, tr_v_y]),

  0x85: Inst('STA', Mode.ZeroPage, [...mode_zeropage, tr_a_v, ...mode_write]),
  0x95: Inst('STA', Mode.ZeroPageX, [...mode_zeropageX, tr_a_v, ...mode_write]),
  0x8d: Inst('STA', Mode.Absolute, [...mode_absolute, tr_a_v, ...mode_write]),
  0x9d: Inst('STA', Mode.AbsoluteX, [...mode_absoluteXSlow, tr_a_v, ...mode_write]),
  0x99: Inst('STA', Mode.AbsoluteY, [...mode_absoluteYSlow, tr_a_v, ...mode_write]),
  0x81: Inst('STA', Mode.IndexedIndirectX, [...mode_indexed_indirectX, tr_a_v, ...mode_write]),
  0x91: Inst('STA', Mode.IndirectIndexedY, [...mode_indirect_indexedYSlow, tr_a_v, ...mode_write]),
  0x86: Inst('STX', Mode.ZeroPage, [...mode_zeropage, tr_x_v, ...mode_write]),
  0x96: Inst('STX', Mode.ZeroPageY, [...mode_zeropageY, tr_x_v, ...mode_write]),
  0x8e: Inst('STX', Mode.Absolute, [...mode_absolute, tr_x_v, ...mode_write]),
  0x84: Inst('STY', Mode.ZeroPage, [...mode_zeropage, tr_y_v, ...mode_write]),
  0x94: Inst('STY', Mode.ZeroPageX, [...mode_zeropageX, tr_y_v, ...mode_write]),
  0x8c: Inst('STY', Mode.Absolute, [...mode_absolute, tr_y_v, ...mode_write]),

  0xaa: Inst('TAX', Mode.Implicit, [tr_a_v, fl_ZN, tr_v_x, ...dummy_cycle]),
  0xa8: Inst('TAY', Mode.Implicit, [tr_a_v, fl_ZN, tr_v_y, ...dummy_cycle]),
  0x8a: Inst('TXA', Mode.Implicit, [tr_x_v, fl_ZN, tr_v_a, ...dummy_cycle]),
  0x98: Inst('TYA', Mode.Implicit, [tr_y_v, fl_ZN, tr_v_a, ...dummy_cycle]),
  0x9a: Inst('TXS', Mode.Implicit, [tr_x_v, tr_v_sp, ...dummy_cycle]),
  0xba: Inst('TSX', Mode.Implicit, [tr_sp_v, fl_ZN, tr_v_x, ...dummy_cycle]),

  0x4c: Inst('JMP', Mode.Absolute, [...mode_absolute, tr_w_pc]),
  0x6c: Inst('JMP', Mode.Indirect, [...mode_indirect, tr_w_pc]),

  0x48: Inst('PHA', Mode.Implicit, [tr_a_v, ...push]),
  0x08: Inst('PHP', Mode.Implicit, [tr_p_v, ...push]),
  0x68: Inst('PLA', Mode.Implicit, [...pull, fl_ZN, tr_v_a]),
  0x28: Inst('PLP', Mode.Implicit, [...pull, tr_v_p]),

  0x38: Inst('SEC', Mode.Implicit, [buildSetFlag(flagC), ...dummy_cycle]),
  0xf8: Inst('SED', Mode.Implicit, [buildSetFlag(flagD), ...dummy_cycle]),
  0x78: Inst('SEI', Mode.Implicit, [buildSetFlag(flagI), ...dummy_cycle]),
  0x18: Inst('CLC', Mode.Implicit, [buildClearFlag(flagC), ...dummy_cycle]),
  0xd8: Inst('CLD', Mode.Implicit, [buildClearFlag(flagD), ...dummy_cycle]),
  0x58: Inst('CLI', Mode.Implicit, [buildClearFlag(flagI), ...dummy_cycle]),
  0xb8: Inst('CLV', Mode.Implicit, [buildClearFlag(flagV), ...dummy_cycle]),
};
