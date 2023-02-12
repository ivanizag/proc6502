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
  pc_target: undefined | number;

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

function getFlag(s: CpuState, flag: number): boolean {
  return (s.p & flag) !== 0;
}

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
    pc_target: undefined,
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
  Relative,
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
    console.log('Missing opcode');
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
const inc_v: CpuAction = s => {
  s.v = (s.v + 1) & 0xff;
};
const dec_v: CpuAction = s => {
  s.v = (s.v - 1 + 256) & 0xff;
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

const from_p: CpuAction = s => {
  s.v = s.p | (flag5 + flagB);
};
const to_p: CpuAction = s => {
  s.p = (s.v | flag5) & ~flagB;
};

const tr_pc_w: CpuAction = s => {
  s.w = s.pc;
};
const tr_pc_w_inc: CpuAction = s => {
  s.w = s.pc;
  s.pc = incWord(s.pc);
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

const buildSet = (flag: number) => {
  const op: CpuAction = s => {
    setFlag(s, flag);
  };
  return op;
};

const buildClear = (flag: number) => {
  const op: CpuAction = s => {
    clearFlag(s, flag);
  };
  return op;
};

const buildBranch = (flag: number, test: boolean) => {
  const op: CpuAction = (s, b) => {
    if (getFlag(s, flag) === test) {
      const offset = s.v > 127 ? s.v - 256 : s.v;
      s.pc_target = (s.pc + offset) & 0xffff;
      s.w = s.pc;
      yield_read(s, b);
    }
  };

  const br_in_page: CpuAction = (s, b) => {
    if (s.pc_target !== undefined) {
      s.pc = (s.pc & 0xff00) + (s.pc_target & 0xff);
      s.w = s.pc;
      if (s.pc !== s.pc_target) {
        s.w = s.pc;
        yield_read(s, b);
      }
    }
  };

  const br_page: CpuAction = s => {
    if (s.pc_target !== undefined && s.pc !== s.pc_target) {
      s.pc = s.pc_target;
    }
    s.pc_target = undefined;
  };

  return [op, br_in_page, br_page];
};

const buildALU = (op: CpuAction) => {
  return [...read, write, op, fl_ZN, write];
};

const buildLogic = (op: CpuAction) => {
  return [...read, op, fl_ZN, to_a];
};

const set_w = (address: number) => {
  const op: CpuAction = s => {
    s.w = address;
  };
  return op;
};

// Operations on v
const op_rol: CpuAction = s => {
  s.v = s.v << 1;
  if (getFlag(s, flagC)) {
    s.v++;
  }
  updateFlag(s, flagC, s.v > 0xff);
  s.v = s.v & 0xff;
};

const op_ror: CpuAction = s => {
  const willCarry = (s.v & 1) !== 0;
  s.v = s.v >> 1;
  if (getFlag(s, flagC)) {
    s.v |= 0x80;
  }
  updateFlag(s, flagC, willCarry);
};

const op_asl: CpuAction = s => {
  s.v = s.v << 1;
  updateFlag(s, flagC, s.v > 0xff);
  s.v = s.v & 0xff;
};

const op_lsr: CpuAction = s => {
  const willCarry = (s.v & 1) !== 0;
  s.v = s.v >> 1;
  updateFlag(s, flagC, willCarry);
};

const op_ora: CpuAction = s => {
  s.v = s.v | s.a;
};

const op_and: CpuAction = s => {
  s.v = s.v & s.a;
};

const op_eor: CpuAction = s => {
  s.v = s.v ^ s.a;
};

const fl_ZN: CpuAction = s => {
  updateFlag(s, flagZ, s.v === 0);
  updateFlag(s, flagN, (s.v & (1 << 7)) !== 0);
};

const fl_bit: CpuAction = s => {
  updateFlag(s, flagZ, (s.v & s.a) === 0);
  updateFlag(s, flagN, (s.v & (1 << 7)) !== 0);
  updateFlag(s, flagV, (s.v & (1 << 6)) !== 0);
};

function cmp_inner(s: CpuState, ref: number) {
  s.v = ref - s.v;
  updateFlag(s, flagC, s.v >= 0);
  s.v = s.v & 0xff;
  updateFlag(s, flagZ, s.v === 0);
  updateFlag(s, flagN, s.v >= 1 << 7);
}

const cmp_a: CpuAction = s => {
  cmp_inner(s, s.a);
};
const cmp_x: CpuAction = s => {
  cmp_inner(s, s.x);
};
const cmp_y: CpuAction = s => {
  cmp_inner(s, s.y);
};

const dummy_cycle = [tr_pc_w, ...read];
const dummy_sp_cycle = [tr_sp_w, ...read];

const push = [tr_push_w, write];
const pull = [tr_pull_w, ...read];
const pre_pull = [...dummy_sp_cycle];
const push_pc = [from_pc_hi, ...push, from_pc_lo, ...push];
const pull_pc = [...pull, to_pc_lo, ...pull, to_pc_hi];

const load_v2_hi = [...read, tr_v_v2];
const load_v2_lo = [...read, tr_v_v2hi, tr_v2_w];
const load_w = [...load_v2_hi, inc_w, ...load_v2_lo];
const load_w_no_cross_page = [...load_v2_hi, inc_w_no_cross_page, ...load_v2_lo];
const load_w_page_zero = [...load_v2_hi, inc_w, page_zero, ...load_v2_lo];
const param_zp_to_w = [tr_pc_w_inc, ...read, tr_v_w];
const param_to_w = [tr_pc_w_inc, inc_pc, ...load_w];

const mode_implicit = [...dummy_cycle];
const mode_immediate = [tr_pc_w_inc];
const mode_relative = [tr_pc_w_inc, ...read];
const mode_zeropage = [...param_zp_to_w];
const mode_zeropageX = [...param_zp_to_w, ...read, from_x, add_v_w_lo];
const mode_zeropageY = [...param_zp_to_w, ...read, from_y, add_v_w_lo];
const mode_absolute = [...param_to_w];
const mode_absoluteXFast = [...param_to_w, from_x, add_v_w, add_w_carry];
const mode_absoluteYFast = [...param_to_w, from_y, add_v_w, add_w_carry];
const mode_absoluteX = [...param_to_w, from_x, add_v_w, no_carry_optimization, add_w_carry];
const mode_absoluteY = [...param_to_w, from_y, add_v_w, no_carry_optimization, add_w_carry];
const mode_indirect = [...param_to_w, ...load_w_no_cross_page];
const mode_indexed_indirectX = [...param_zp_to_w, ...read, from_x, add_v_w_lo, ...load_w_page_zero];
const mode_indirect_indexedY = [...param_zp_to_w, ...load_w_page_zero, from_y, add_v_w, add_w_carry];
const mode_indirect_indexedYSlow = [...param_zp_to_w, ...load_w_page_zero, from_y, add_v_w, no_carry_optimization, add_w_carry];

function Inst(name: string, mode: Mode, steps: CpuAction[]): Instruction {
  return {name, mode, steps};
}

// TODO: remove this export once completed.
export const instructions: {[id: number]: Instruction} = {
  0xea: Inst('NOP', Mode.Implicit, [...mode_implicit]),

  0xa9: Inst('LDA', Mode.Immediate, [...mode_immediate, ...read, fl_ZN, to_a]),
  0xa5: Inst('LDA', Mode.ZeroPage, [...mode_zeropage, ...read, fl_ZN, to_a]),
  0xb5: Inst('LDA', Mode.ZeroPageX, [...mode_zeropageX, ...read, fl_ZN, to_a]),
  0xad: Inst('LDA', Mode.Absolute, [...mode_absolute, ...read, fl_ZN, to_a]),
  0xbd: Inst('LDA', Mode.AbsoluteX, [...mode_absoluteXFast, ...read, fl_ZN, to_a]),
  0xb9: Inst('LDA', Mode.AbsoluteY, [...mode_absoluteYFast, ...read, fl_ZN, to_a]),
  0xa1: Inst('LDA', Mode.IndexedIndirectX, [...mode_indexed_indirectX, ...read, fl_ZN, to_a]),
  0xb1: Inst('LDA', Mode.IndirectIndexedY, [...mode_indirect_indexedY, ...read, fl_ZN, to_a]),
  0xbe: Inst('LDX', Mode.AbsoluteY, [...mode_absoluteYFast, ...read, fl_ZN, to_x]),
  0xa2: Inst('LDX', Mode.Immediate, [...mode_immediate, ...read, fl_ZN, to_x]),
  0xa6: Inst('LDX', Mode.ZeroPage, [...mode_zeropage, ...read, fl_ZN, to_x]),
  0xb6: Inst('LDX', Mode.ZeroPageY, [...mode_zeropageY, ...read, fl_ZN, to_x]),
  0xae: Inst('LDX', Mode.Absolute, [...mode_absolute, ...read, fl_ZN, to_x]),
  0xa0: Inst('LDY', Mode.Immediate, [...mode_immediate, ...read, fl_ZN, to_y]),
  0xa4: Inst('LDY', Mode.ZeroPage, [...mode_zeropage, ...read, fl_ZN, to_y]),
  0xb4: Inst('LDY', Mode.ZeroPageX, [...mode_zeropageX, ...read, fl_ZN, to_y]),
  0xac: Inst('LDY', Mode.Absolute, [...mode_absolute, ...read, fl_ZN, to_y]),
  0xbc: Inst('LDY', Mode.AbsoluteX, [...mode_absoluteXFast, ...read, fl_ZN, to_y]),

  0x85: Inst('STA', Mode.ZeroPage, [...mode_zeropage, from_a, write]),
  0x95: Inst('STA', Mode.ZeroPageX, [...mode_zeropageX, from_a, write]),
  0x8d: Inst('STA', Mode.Absolute, [...mode_absolute, from_a, write]),
  0x9d: Inst('STA', Mode.AbsoluteX, [...mode_absoluteX, from_a, write]),
  0x99: Inst('STA', Mode.AbsoluteY, [...mode_absoluteY, from_a, write]),
  0x81: Inst('STA', Mode.IndexedIndirectX, [...mode_indexed_indirectX, from_a, write]),
  0x91: Inst('STA', Mode.IndirectIndexedY, [...mode_indirect_indexedYSlow, from_a, write]),
  0x86: Inst('STX', Mode.ZeroPage, [...mode_zeropage, from_x, write]),
  0x96: Inst('STX', Mode.ZeroPageY, [...mode_zeropageY, from_x, write]),
  0x8e: Inst('STX', Mode.Absolute, [...mode_absolute, from_x, write]),
  0x84: Inst('STY', Mode.ZeroPage, [...mode_zeropage, from_y, write]),
  0x94: Inst('STY', Mode.ZeroPageX, [...mode_zeropageX, from_y, write]),
  0x8c: Inst('STY', Mode.Absolute, [...mode_absolute, from_y, write]),

  0xaa: Inst('TAX', Mode.Implicit, [...mode_implicit, from_a, fl_ZN, to_x]),
  0xa8: Inst('TAY', Mode.Implicit, [...mode_implicit, from_a, fl_ZN, to_y]),
  0x8a: Inst('TXA', Mode.Implicit, [...mode_implicit, from_x, fl_ZN, to_a]),
  0x98: Inst('TYA', Mode.Implicit, [...mode_implicit, from_y, fl_ZN, to_a]),
  0x9a: Inst('TXS', Mode.Implicit, [...mode_implicit, from_x, to_sp]),
  0xba: Inst('TSX', Mode.Implicit, [...mode_implicit, from_sp, fl_ZN, to_x]),

  0x00: Inst('BRK', Mode.Implicit, [...mode_implicit, inc_pc, ...push_pc, from_p, ...push, set_w(0xfffe), ...load_w, tr_w_pc, buildSet(flagI)]),
  0x4c: Inst('JMP', Mode.Absolute, [...mode_absolute, tr_w_pc]),
  0x6c: Inst('JMP', Mode.Indirect, [...mode_indirect, tr_w_pc]),
  0x20: Inst('JSR', Mode.Absolute, [tr_pc_w_inc, ...load_v2_hi, ...pre_pull, ...push_pc, tr_pc_w_inc, ...load_v2_lo, tr_w_pc]),
  0x40: Inst('RTI', Mode.Implicit, [...mode_implicit, ...pre_pull, ...pull, to_p, ...pull_pc]),
  0x60: Inst('RTS', Mode.Implicit, [...mode_implicit, ...pre_pull, ...pull_pc, ...dummy_cycle, inc_pc]),

  0x48: Inst('PHA', Mode.Implicit, [...mode_implicit, from_a, ...push]),
  0x08: Inst('PHP', Mode.Implicit, [...mode_implicit, from_p, ...push]),
  0x68: Inst('PLA', Mode.Implicit, [...mode_implicit, ...pre_pull, ...pull, fl_ZN, to_a]),
  0x28: Inst('PLP', Mode.Implicit, [...mode_implicit, ...pre_pull, ...pull, to_p]),

  0x38: Inst('SEC', Mode.Implicit, [...mode_implicit, buildSet(flagC)]),
  0xf8: Inst('SED', Mode.Implicit, [...mode_implicit, buildSet(flagD)]),
  0x78: Inst('SEI', Mode.Implicit, [...mode_implicit, buildSet(flagI)]),
  0x18: Inst('CLC', Mode.Implicit, [...mode_implicit, buildClear(flagC)]),
  0xd8: Inst('CLD', Mode.Implicit, [...mode_implicit, buildClear(flagD)]),
  0x58: Inst('CLI', Mode.Implicit, [...mode_implicit, buildClear(flagI)]),
  0xb8: Inst('CLV', Mode.Implicit, [...mode_implicit, buildClear(flagV)]),

  0x90: Inst('BCC', Mode.Relative, [...mode_relative, ...buildBranch(flagC, false)]),
  0xb0: Inst('BCS', Mode.Relative, [...mode_relative, ...buildBranch(flagC, true)]),
  0xd0: Inst('BNE', Mode.Relative, [...mode_relative, ...buildBranch(flagZ, false)]),
  0xf0: Inst('BEQ', Mode.Relative, [...mode_relative, ...buildBranch(flagZ, true)]),
  0x10: Inst('BPL', Mode.Relative, [...mode_relative, ...buildBranch(flagN, false)]),
  0x30: Inst('BMI', Mode.Relative, [...mode_relative, ...buildBranch(flagN, true)]),
  0x50: Inst('BVC', Mode.Relative, [...mode_relative, ...buildBranch(flagV, false)]),
  0x70: Inst('BVS', Mode.Relative, [...mode_relative, ...buildBranch(flagV, true)]),

  0xe6: Inst('INC', Mode.ZeroPage, [...mode_zeropage, ...buildALU(inc_v)]),
  0xf6: Inst('INC', Mode.ZeroPageX, [...mode_zeropageX, ...buildALU(inc_v)]),
  0xee: Inst('INC', Mode.Absolute, [...mode_absolute, ...buildALU(inc_v)]),
  0xfe: Inst('INC', Mode.AbsoluteX, [...mode_absoluteX, ...buildALU(inc_v)]),
  0xc6: Inst('DEC', Mode.ZeroPage, [...mode_zeropage, ...buildALU(dec_v)]),
  0xd6: Inst('DEC', Mode.ZeroPageX, [...mode_zeropageX, ...buildALU(dec_v)]),
  0xce: Inst('DEC', Mode.Absolute, [...mode_absolute, ...buildALU(dec_v)]),
  0xde: Inst('DEC', Mode.AbsoluteX, [...mode_absoluteX, ...buildALU(dec_v)]),

  0xe8: Inst('INX', Mode.Implicit, [...mode_implicit, from_x, inc_v, fl_ZN, to_x]),
  0xc8: Inst('INY', Mode.Implicit, [...mode_implicit, from_y, inc_v, fl_ZN, to_y]),
  0xca: Inst('DEX', Mode.Implicit, [...mode_implicit, from_x, dec_v, fl_ZN, to_x]),
  0x88: Inst('DEY', Mode.Implicit, [...mode_implicit, from_y, dec_v, fl_ZN, to_y]),

  0x2a: Inst('ROL', Mode.Implicit, [...mode_implicit, from_a, op_rol, fl_ZN, to_a]),
  0x26: Inst('ROL', Mode.ZeroPage, [...mode_zeropage, ...buildALU(op_rol)]),
  0x36: Inst('ROL', Mode.ZeroPageX, [...mode_zeropageX, ...buildALU(op_rol)]),
  0x2e: Inst('ROL', Mode.Absolute, [...mode_absolute, ...buildALU(op_rol)]),
  0x3e: Inst('ROL', Mode.AbsoluteX, [...mode_absoluteX, ...buildALU(op_rol)]),
  0x6a: Inst('ROR', Mode.Implicit, [...mode_implicit, from_a, op_ror, fl_ZN, to_a]),
  0x66: Inst('ROR', Mode.ZeroPage, [...mode_zeropage, ...buildALU(op_ror)]),
  0x76: Inst('ROR', Mode.ZeroPageX, [...mode_zeropageX, ...buildALU(op_ror)]),
  0x6e: Inst('ROR', Mode.Absolute, [...mode_absolute, ...buildALU(op_ror)]),
  0x7e: Inst('ROR', Mode.AbsoluteX, [...mode_absoluteX, ...buildALU(op_ror)]),
  0x0a: Inst('ASL', Mode.Implicit, [...mode_implicit, from_a, op_asl, fl_ZN, to_a]),
  0x06: Inst('ASL', Mode.ZeroPage, [...mode_zeropage, ...buildALU(op_asl)]),
  0x16: Inst('ASL', Mode.ZeroPageX, [...mode_zeropageX, ...buildALU(op_asl)]),
  0x0e: Inst('ASL', Mode.Absolute, [...mode_absolute, ...buildALU(op_asl)]),
  0x1e: Inst('ASL', Mode.AbsoluteX, [...mode_absoluteX, ...buildALU(op_asl)]),
  0x4a: Inst('LSR', Mode.Implicit, [...mode_implicit, from_a, op_lsr, fl_ZN, to_a]),
  0x46: Inst('LSR', Mode.ZeroPage, [...mode_zeropage, ...buildALU(op_lsr)]),
  0x56: Inst('LSR', Mode.ZeroPageX, [...mode_zeropageX, ...buildALU(op_lsr)]),
  0x4e: Inst('LSR', Mode.Absolute, [...mode_absolute, ...buildALU(op_lsr)]),
  0x5e: Inst('LSR', Mode.AbsoluteX, [...mode_absoluteX, ...buildALU(op_lsr)]),

  0x09: Inst('ORA', Mode.Immediate, [...mode_immediate, ...buildLogic(op_ora)]),
  0x05: Inst('ORA', Mode.ZeroPage, [...mode_zeropage, ...buildLogic(op_ora)]),
  0x15: Inst('ORA', Mode.ZeroPageX, [...mode_zeropageX, ...buildLogic(op_ora)]),
  0x0d: Inst('ORA', Mode.Absolute, [...mode_absolute, ...buildLogic(op_ora)]),
  0x1d: Inst('ORA', Mode.AbsoluteX, [...mode_absoluteXFast, ...buildLogic(op_ora)]),
  0x19: Inst('ORA', Mode.AbsoluteY, [...mode_absoluteYFast, ...buildLogic(op_ora)]),
  0x01: Inst('ORA', Mode.IndexedIndirectX, [...mode_indexed_indirectX, ...buildLogic(op_ora)]),
  0x11: Inst('ORA', Mode.IndirectIndexedY, [...mode_indirect_indexedY, ...buildLogic(op_ora)]),
  0x29: Inst('AND', Mode.Immediate, [...mode_immediate, ...buildLogic(op_and)]),
  0x25: Inst('AND', Mode.ZeroPage, [...mode_zeropage, ...buildLogic(op_and)]),
  0x35: Inst('AND', Mode.ZeroPageX, [...mode_zeropageX, ...buildLogic(op_and)]),
  0x2d: Inst('AND', Mode.Absolute, [...mode_absolute, ...buildLogic(op_and)]),
  0x3d: Inst('AND', Mode.AbsoluteX, [...mode_absoluteXFast, ...buildLogic(op_and)]),
  0x39: Inst('AND', Mode.AbsoluteY, [...mode_absoluteYFast, ...buildLogic(op_and)]),
  0x21: Inst('AND', Mode.IndexedIndirectX, [...mode_indexed_indirectX, ...buildLogic(op_and)]),
  0x31: Inst('AND', Mode.IndirectIndexedY, [...mode_indirect_indexedY, ...buildLogic(op_and)]),
  0x49: Inst('EOR', Mode.Immediate, [...mode_immediate, ...buildLogic(op_eor)]),
  0x45: Inst('EOR', Mode.ZeroPage, [...mode_zeropage, ...buildLogic(op_eor)]),
  0x55: Inst('EOR', Mode.ZeroPageX, [...mode_zeropageX, ...buildLogic(op_eor)]),
  0x4d: Inst('EOR', Mode.Absolute, [...mode_absolute, ...buildLogic(op_eor)]),
  0x5d: Inst('EOR', Mode.AbsoluteX, [...mode_absoluteXFast, ...buildLogic(op_eor)]),
  0x59: Inst('EOR', Mode.AbsoluteY, [...mode_absoluteYFast, ...buildLogic(op_eor)]),
  0x41: Inst('EOR', Mode.IndexedIndirectX, [...mode_indexed_indirectX, ...buildLogic(op_eor)]),
  0x51: Inst('EOR', Mode.IndirectIndexedY, [...mode_indirect_indexedY, ...buildLogic(op_eor)]),

  0xc9: Inst('CMP', Mode.Immediate, [...mode_immediate, ...read, cmp_a]),
  0xc5: Inst('CMP', Mode.ZeroPage, [...mode_zeropage, ...read, cmp_a]),
  0xd5: Inst('CMP', Mode.ZeroPageX, [...mode_zeropageX, ...read, cmp_a]),
  0xcd: Inst('CMP', Mode.Absolute, [...mode_absolute, ...read, cmp_a]),
  0xdd: Inst('CMP', Mode.AbsoluteX, [...mode_absoluteXFast, ...read, cmp_a]),
  0xd9: Inst('CMP', Mode.AbsoluteY, [...mode_absoluteYFast, ...read, cmp_a]),
  0xc1: Inst('CMP', Mode.IndexedIndirectX, [...mode_indexed_indirectX, ...read, cmp_a]),
  0xd1: Inst('CMP', Mode.IndirectIndexedY, [...mode_indirect_indexedY, ...read, cmp_a]),
  0xe0: Inst('CPX', Mode.Immediate, [...mode_immediate, ...read, cmp_x]),
  0xe4: Inst('CPX', Mode.ZeroPage, [...mode_zeropage, ...read, cmp_x]),
  0xec: Inst('CPX', Mode.Absolute, [...mode_absolute, ...read, cmp_x]),
  0xc0: Inst('CPY', Mode.Immediate, [...mode_immediate, ...read, cmp_y]),
  0xc4: Inst('CPY', Mode.ZeroPage, [...mode_zeropage, ...read, cmp_y]),
  0xcc: Inst('CPY', Mode.Absolute, [...mode_absolute, ...read, cmp_y]),

  0x24: Inst('BIT', Mode.ZeroPage, [...mode_zeropage, ...read, fl_bit]),
  0x2c: Inst('BIT', Mode.Absolute, [...mode_absolute, ...read, fl_bit]),

  // ADC, SBC
};
