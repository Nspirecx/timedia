var a0 = 0; // address registers, treat as 32 bit ints (A8 = the currently unused address register)

var a0 = 0; // address registers, treat as 32 bit ints (A8 = the currently unused address register)

var a1 = 0;

var a2 = 0;

var a3 = 0;

var a4 = 0;

var a5 = 0;

var a6 = 0;

var a7 = 0;

var a8 = 0;

var d0 = 0; // data registers, treat as 32 bit ints

var d1 = 0;

var d2 = 0;

var d3 = 0;

var d4 = 0;

var d5 = 0;

var d6 = 0;

var d7 = 0;

var sr = 0; // status register, treat as 16 bit int

var pc = 0; // program counter, treat as 32 bit int

var ram = new Array(131072); // 256K of RAM, treat as array of words

var ramflag = new Array(131072);

var t = new Array(65536);

var n = new Array(65536);

var calcscreen = new Array(240 * 128 * 3); // stores three frames of pixel data for averaging

var frame = 0;

var unhandled_count = 0; // number of unhandled instructions encountered

var interval = 0; // interval ID of main timer

var tracecount = 20; // number of instructions to trace in console

var vectorprotect = false;

var overall = 2500;

var osc2_counter = 0;

var timer_min = 0xB2;

var timer_current = 0;

var lcd_address_high = 9; // stores LCD address / 8, corresponding to the default 0x4c00

var lcd_address_low = 0x80;

var screen_height = 128;

var keystatus = new Array(80); // status of each key is at ROW * 8 + COLUMN

var keymasklow = 0xFF; // which key rows are selected to read (from 600019)

var keymaskhigh = 0xFF;

var frames_counted = 0;

var total_time = 0;

var newromready = false;

var newfileready = false;

var link_incoming_queue = new Array();

var link_outgoing_queue = new Array();

var link_config = 1;

var transmit_finished = false;

var stopped = false;

var wakemask = 0;

var interrupt_control = 0x1B;

var interrupt_rate = 0x200;



function to_hex(number, digits)

{

  var s = "";

  if (number < 0)

  {

    number = -number;

    digits--;

    s = "-";

  }



  var c = "0123456789ABCDEF";

  while (digits--)

  {

    digit = number % 16;

    number = (number - digit) / 16;

    s = c[digit] + s;

  }

  return s;

}



// returns the executor for an unimplemented instruction

function make_unhandled(i)

{

  return function() {

    console.log("Unhandled instruction " + to_hex(i, 4) + " at address " + to_hex(pc - 2, 8));

    unhandled_count++;

  };

};



// brief display of the system status

function print_status()

{

  console.log("---")

  opcode = rw(pc);

  console.log("PC=" + to_hex(pc, 9) + " SR=" + to_hex(sr, 4) + " opcode=" + to_hex(opcode, 4) + " " + n[opcode]);

  var a = "";

  var d = "";

  for (var r = 0; r < 8; r++)

  {

    a += "A" + r + "=" + to_hex(eval("a" + r), 9) + " ";

    d += "D" + r + "=" + to_hex(eval("d" + r), 9) + " ";

  }

  console.log(d);

  console.log(a);



  /*for (var startaddress = 0x4b00; startaddress <= 0x4bc0; startaddress += 0x40)

  {	

  	var m = to_hex(startaddress, 8) + " -> ";

  	for (var addr = startaddress; addr < startaddress + 64; addr += 2)

  		m = m + to_hex(ram[addr] * 256 + ram[addr+1], 4) + " ";

  	console.log(m);	

  }*/

}



// sign extend functions



function ebw(value)

{

  value = value & 0xFF;

  return (value <= 0x7F) ? value : 0xFF00 + value;

}



function ewl(value)

{

  value = value & 0xFFFF;

  return (value <= 0x7FFF) ? value : 0xFFFF0000 + value;

}



// Functions to perform addition and subtraction and update the condition codes



function subw(subtrahend, minuend)

{

  subtrahend &= 0xFFFF;

  minuend &= 0xFFFF;

  var complement = 0x10000 - subtrahend;

  var result = complement + minuend;

  var maskedresult = result >= 0x10000 ? result - 0x10000 : result;

  sr = sr & 0xFFE0;

  if (maskedresult == 0) sr += 4; // zero flag

  if (result & 0x8000) sr += 8; // negative flag

  if (maskedresult < 0) maskedresult += 0x100000000;

  if (complement < 0x8000 && minuend < 0x8000 && maskedresult >= 0x8000) sr += 2; // overflow flag

  if (complement >= 0x8000 && minuend >= 0x8000 && maskedresult < 0x8000) sr += 2; // overflow flag

  if (subtrahend > minuend) sr += 0x11; // carry and overflow

  return maskedresult;

}



function cmpw(subtrahend, minuend)

{

  subtrahend &= 0xFFFF;

  minuend &= 0xFFFF;

  var complement = 0x10000 - subtrahend;

  var result = complement + minuend;

  var maskedresult = result >= 0x10000 ? result - 0x10000 : result;

  sr = sr & 0xFFF0;

  if (maskedresult == 0) sr += 4; // zero flag

  if (result & 0x8000) sr += 8; // negative flag

  if (maskedresult < 0) maskedresult += 0x100000000;

  if (complement < 0x8000 && minuend < 0x8000 && maskedresult >= 0x8000) sr += 2; // overflow flag

  if (complement >= 0x8000 && minuend >= 0x8000 && maskedresult < 0x8000) sr += 2; // overflow flag

  if (subtrahend > minuend) sr += 1; // carry and overflow

  return maskedresult;

}



function addw(x, y)

{

  x &= 0xFFFF;

  y &= 0xFFFF;

  var result = x + y;

  var maskedresult = result & 0xFFFF;

  sr = sr & 0xFFE0;

  if (maskedresult == 0) sr += 4; // zero flag

  if (result & 0x8000) sr += 8; // negative flag

  if (result != maskedresult) sr += 0x11; // carry and overflow

  if (y < 0x8000 && x < 0x8000 && maskedresult >= 0x8000) sr += 2; // overflow flag

  if (y >= 0x8000 && x >= 0x8000 && maskedresult < 0x8000) sr += 2; // overflow flag

  return maskedresult;

}



function subb(subtrahend, minuend)

{

  subtrahend &= 0xFF;

  minuend &= 0xFF;

  var complement = 0x100 - subtrahend;

  var result = complement + minuend;

  var maskedresult = result >= 0x100 ? result - 0x100 : result;

  sr = sr & 0xFFE0;

  if (maskedresult == 0) sr += 4; // zero flag

  if (result & 0x80) sr += 8; // negative flag

  if (maskedresult < 0) maskedresult += 0x100000000;

  if (complement < 0x80 && minuend < 0x80 && maskedresult >= 0x80) sr += 2; // overflow flag

  if (complement >= 0x80 && minuend >= 0x80 && maskedresult < 0x80) sr += 2; // overflow flag

  if (subtrahend > minuend) sr += 0x11; // carry and overflow

  return maskedresult;

}



function cmpb(subtrahend, minuend)

{

  subtrahend &= 0xFF;

  minuend &= 0xFF;

  var complement = 0x100 - subtrahend;

  var result = complement + minuend;

  var maskedresult = result >= 0x100 ? result - 0x100 : result;

  sr = sr & 0xFFF0;

  if (maskedresult == 0) sr += 4; // zero flag

  if (result & 0x80) sr += 8; // negative flag

  if (maskedresult < 0) maskedresult += 0x100000000;

  if (complement < 0x80 && minuend < 0x80 && maskedresult >= 0x80) sr += 2; // overflow flag

  if (complement >= 0x80 && minuend >= 0x80 && maskedresult < 0x80) sr += 2; // overflow flag

  if (subtrahend > minuend) sr += 1; // carry and overflow

  return maskedresult;

}



function addb(x, y)

{

  x &= 0xFF;

  y &= 0xFF;

  var result = x + y;

  var maskedresult = result & 0xFF;

  sr = sr & 0xFFE0;

  if (maskedresult == 0) sr += 4; // zero flag

  if (result & 0x80) sr += 8; // negative flag

  if (result != maskedresult) sr += 0x11; // carry and overflow

  if (y < 0x80 && x < 0x80 && maskedresult >= 0x80) sr += 2; // overflow flag

  if (y >= 0x80 && x >= 0x80 && maskedresult < 0x80) sr += 2; // overflow flag

  return maskedresult;

}



function subl(subtrahend, minuend)

{

  var complement = 0x100000000 - subtrahend;

  var result = complement + minuend;

  var maskedresult = result >= 0x100000000 ? result - 0x100000000 : result;

  sr = sr & 0xFFE0;

  if (maskedresult == 0) sr += 4; // zero flag

  if (result & 0x80000000) sr += 8; // negative flag

  if (maskedresult < 0) maskedresult += 0x100000000;

  if (complement < 0x80000000 && minuend < 0x80000000 && maskedresult >= 0x80000000) sr += 2; // overflow flag

  if (complement >= 0x80000000 && minuend >= 0x80000000 && maskedresult < 0x80000000) sr += 2; // overflow flag

  if (subtrahend > minuend) sr += 0x11; // carry and overflow

  return maskedresult;

}



function cmpl(subtrahend, minuend)

{

  var complement = 0x100000000 - subtrahend;

  var result = complement + minuend;

  var maskedresult = result >= 0x100000000 ? result - 0x100000000 : result;

  sr = sr & 0xFFF0;

  if (maskedresult == 0) sr += 4; // zero flag

  if (result & 0x80000000) sr += 8; // negative flag

  if (maskedresult < 0) maskedresult += 0x100000000;

  if (complement < 0x80000000 && minuend < 0x80000000 && maskedresult >= 0x80000000) sr += 2; // overflow flag

  if (complement >= 0x80000000 && minuend >= 0x80000000 && maskedresult < 0x80000000) sr += 2; // overflow flag

  if (subtrahend > minuend) sr += 1; // carry and overflow

  return maskedresult;

}



function addl(x, y)

{

  var result = x + y;

  var maskedresult = result >= 0x100000000 ? result - 0x100000000 : result;

  sr = sr & 0xFFE0;

  if (maskedresult == 0) sr += 4; // zero flag

  if (result & 0x80000000) sr += 8; // negative flag

  if (result != maskedresult) sr += 0x11; // carry and overflow

  if (maskedresult < 0) maskedresult += 0x100000000;

  if (x < 0x80000000 && y < 0x80000000 && maskedresult >= 0x80000000) sr += 2; // overflow flag

  if (x >= 0x80000000 && y >= 0x80000000 && maskedresult < 0x80000000) sr += 2; // overflow flag

  return maskedresult;

}



function abcd(x, y)

{

  var lowsum = (x & 0xF) + (y & 0xF);

  if (sr & 0x10) lowsum++; // carry in from the x register



  var carrymid = 0;

  if (lowsum >= 10) {

    lowsum -= 10;

    carrymid = 0x10;

  }



  var highsum = (x & 0xF0) + (y & 0xF0) + carrymid;

  sr &= 0xFFE4;

  if (highsum >= 0xA0) {

    highsum -= 0xA0;

    sr |= 0x11; // carry out into both X and C

  }

  var result = highsum + lowsum;

  if (result != 0) sr &= 0xFFFB; // zero flag

  return result;

}



function sbcd(dst, src)

{

  src &= 0xFF;

  dst &= 0xFF;

  var subtrahend = (src >> 4) * 10 + (src & 0xF);

  var minuend = (dst >> 4) * 10 + (dst & 0xF);

  var result = minuend - subtrahend;

  if (sr & 1) result--; // borrow from previous subtraction

  sr &= 0xFFE4; // clear all condition codes but Z

  if (result < 0) {

    result = result + 100;

    sr |= 0x11; // set carry and extend if we had a borrow;

  }

  if (finalresult != 0) sr &= 0xFFFB; // clear zero flag

  var lowdigit = result % 10;

  var highdigit = (result - lowdigit) / 10;

  var finalresult = highdigit * 16 + lowdigit;

  //console.log("SBCD " + minuend + " minus " + subtrahend + " = " + result + " with A1 = " + aregs[1]);

  return finalresult;

}



function addx(x, y, size)

{

  var overflow = 0x100;

  if (size == 1) overflow = 0x10000;

  if (size == 2) overflow = 0x100000000;

  var neg = overflow / 2;

  var result = x + y;

  if (sr & 0x10) result++; // carry in from X bit

  sr &= 0xFFE4; // clear condition flags but Z

  if (result >= overflow)

  {

    result -= overflow;

    sr |= 0x11; // set X and C on carry out

  }

  if (result != 0) sr &= 0xFFBF; // clear zero flag

  if (result + result >= overflow) sr |= 8; // set negative flag

  if (x >= neg && y >= neg && result < neg) sr |= 2; // set overflow flag

  if (x < neg && y < neg && result >= neg) sr |= 2;

  return result;

}



function subx(x, y, size)

{

  var overflow = 0x100;

  if (size == 1) overflow = 0x10000;

  if (size == 2) overflow = 0x100000000;

  var neg = overflow / 2;

  var result = y - x;

  if (sr & 0x10) result--; // carry in from X bit

  sr &= 0xFFE4; // clear condition flags but Z

  if (result < 0)

  {

    result += overflow;

    sr |= 0x11; // set X and C on carry out

  }

  if (result != 0) sr &= 0xFFBF; // clear zero flag

  if (result + result >= overflow) sr |= 8; // set negative flag

  if (x >= neg && y < neg && result >= neg) sr |= 2; // set overflow flag (positive minus negative giving negative)

  if (x < neg && y >= neg && result < neg) sr |= 2; // set overflow flag (negative minus positive giving positive)

  return result;

}



// Multiplication and division



function muls(x, y)

{

  x = x & 0xFFFF;

  y = y & 0xFFFF;

  if (x >= 0x8000) x -= 0x10000;

  if (y >= 0x8000) y -= 0x10000;

  product = x * y;

  sr &= 0xFFF0; // clear all user flags but X

  if (product < 0) {

    product += 0x100000000;

    sr |= 8; // negative flag

  }

  if (product == 0) sr |= 4; // zero flag

  return product;

}



function mulu(x, y)

{

  x = x & 0xFFFF;

  y = y & 0xFFFF;

  product = x * y;

  sr &= 0xFFF0; // clear all user flags but X

  if (product >= 0x80000000) sr |= 8; // negative flag

  if (product == 0) sr |= 4; // zero flag

  return product;

}



function divu(divisor, dividend)

{

  if (divisor == 0) throw 5;

  var quotient = Math.floor(dividend / divisor);

  var remainder = dividend % divisor;

  sr &= 0xFFF0; // clear all user flags but X

  if (quotient >= 0x80000000) sr |= 8; // negative flag

  if (quotient == 0) sr |= 4; // zero flag



  if (quotient >= 0x10000) {

    if (quotient >= 0x80000000) sr |= 8; // negative

    sr |= 2; // overflow

    return dividend;

  }

  if (quotient > 0x10000 || remainder > 0x10000 || quotient < 0 || remainder < 0) console.log("bad divide!");

  return quotient + (remainder << 16);

}



function divs(divisor, dividend)

{

  //console.log("signed divide " + to_hex(dividend,8) + " by " + to_hex(divisor,8));



  if (divisor == 0) throw 5;



  var adivisor = divisor >= 0x8000 ? divisor - 0x10000 : divisor;

  var adividend = dividend >= 0x80000000 ? dividend - 0x100000000 : dividend;



  var quotient = Math.floor(adividend / adivisor);

  var remainder = adividend % adivisor;



  //console.log("decimal results : " + adividend + " divided by " + adivisor + " = " + quotient + " remainder " + remainder);



  sr &= 0xFFF0; // clear all user flags but X

  if (quotient >= 0x80000000) sr |= 8; // negative flag

  if (quotient == 0) sr |= 4; // zero flag



  if (quotient >= 0x8000 || quotient < -32768) {

    if (quotient >= 0x80000000) sr |= 8; // negative

    sr |= 2; // overflow

    return dividend;

  }



  if (quotient < 0) quotient += 0x10000;

  if (remainder < 0) remainder += 0x10000;



  //console.log("final result is " + to_hex(quotient + (remainder * 65536), 8));



  return quotient + (remainder * 65536);

}



// Functions to perform shifts and set the condition codes



// note - some of these should leave condition flags alone if shift count is 0



function lsl(x, shift, size)

{

  //if (shift == 0) console.log ("LSL 0 at " + to_hex(pc, 6));



  var overflow = 0x100;

  if (size == 1) overflow = 0x10000;

  if (size == 2) overflow = 0x100000000;

  sr &= 0xFFE0; // initially clear all user condition flags

  while (shift--)

  {

    x = x + x;

    if (x >= overflow) {

      x -= overflow;

      if (shift == 0) sr |= 0x11; // set carry and extend if last bit shifted out is 1

    }

  }

  if (x + x >= overflow) sr |= 8 // negative flag

  if (x == 0) sr |= 4; // zero flag

  return x;

}



function asl(x, shift, size)

{

  //if (shift == 0) console.log ("ASL 0 at " + to_hex(pc, 6));



  var overflow = 0x100;

  if (size == 1) overflow = 0x10000;

  if (size == 2) overflow = 0x100000000;

  sr &= 0xFFE1; // initially clear all user condition flags but carry

  if (shift > 0) sr &= 0xFFE0; // clear carry if nonzero shift

  while (shift--)

  {

    old = x;

    x = x + x;

    if (x >= overflow) {

      x -= overflow;

      if (shift == 0) sr |= 0x11; // set carry and extend if last bit shifted out is 1

    }

    if ((x & (overflow / 2)) != (old & (overflow / 2))) sr |= 2; // set overflow flag if high bit changed

  }

  if (x + x >= overflow) sr |= 8 // negative flag

  if (x == 0) sr |= 4; // zero flag

  return x;

}



function lsr(x, shift, size)

{

  //if (shift == 0) console.log ("LSR 0 at " + to_hex(pc, 6));



  var overflow = 0x100;

  if (size == 1) overflow = 0x10000;

  if (size == 2) overflow = 0x100000000;

  sr &= 0xFFE0; // initially clear all user condition flags

  while (shift--)

  {

    if ((shift == 0) && (x & 1)) sr |= 0x11; // set carry and extend if last bit shifted out is 1

    x >>>= 1;

  }

  if (x + x >= overflow) sr |= 8 // negative flag

  if (x == 0) sr |= 4; // zero flag

  return x;

}



function asr(x, shift, size)

{

  //if (shift == 0) console.log ("ASR 0 at " + to_hex(pc, 6));



  var overflow = 0x100;

  if (size == 1) overflow = 0x10000;

  if (size == 2) overflow = 0x100000000;

  sr &= 0xFFF0; // initially clear all user condition flags but X

  if (shift > 0) sr &= 0xFFEF; // clear X if nonzero shift count

  while (shift--)

  {

    if ((shift == 0) && (x & 1)) sr |= 0x11; // set carry and extend if last bit shifted out is 1

    if (x & (overflow / 2)) x += overflow;

    x = Math.floor(x / 2);

  }

  if (x + x >= overflow) sr |= 8 // negative flag

  if (x == 0) sr |= 4; // zero flag

  return x;

}



function ror(x, shift, size)

{

  //if (shift == 0) console.log ("ROR 0 at " + to_hex(pc, 6));



  var overflow = 0x100;

  if (size == 1) overflow = 0x10000;

  if (size == 2) overflow = 0x100000000;

  sr &= 0xFFF0; // initially clear all user condition flags but X

  while (shift--)

  {

    var out = x & 1;

    x >>>= 1;

    if (out) x = x + overflow / 2;

  }

  if (x + x >= overflow) sr |= 0x9 // negative flag and carry flag

  if (x == 0) sr |= 4; // zero flag

  return x;

}



function rol(x, shift, size)

{

  //if (shift == 0) console.log ("ROL 0 at " + to_hex(pc, 6));



  var overflow = 0x100;

  if (size == 1) overflow = 0x10000;

  if (size == 2) overflow = 0x100000000;

  sr &= 0xFFF0; // initially clear all user condition flags but X

  while (shift--)

  {

    x = x + x;

    if (x >= overflow) x = x + 1 - overflow;

  }

  if (x + x >= overflow) sr |= 0x8; // negative flag

  if (x & 1) sr |= 1; // carry flag

  if (x == 0) sr |= 4; // zero flag

  return x;

}



function roxr(x, shift, size)

{

  var overflow = 0x100;

  if (size == 1) overflow = 0x10000;

  if (size == 2) overflow = 0x100000000;

  while (shift--)

  {

    var out = x & 1;

    x >>>= 1;

    if (sr & 0x10) x = x + overflow / 2; // shift 1 in if X was set

    sr = sr & 0xFFE0; // clear all user condition flags including X

    if (out) sr += 0x10; // set X if bit shifted out was set

  }

  if (x + x >= overflow) sr |= 0x9 // negative flag and carry flag

  if (x == 0) sr |= 4; // zero flag

  if (sr & 0x10) sr |= 1; // carry flag gets a copy of the X flag

  return x;

}



function roxl(x, shift, size)

{

  var overflow = 0x100;

  if (size == 1) overflow = 0x10000;

  if (size == 2) overflow = 0x100000000;

  while (shift--)

  {

    x = x + x;

    if (sr & 0x10) x = x + 1; // shift 1 in if X was set

    sr &= 0xFFE0; // clear all user condition flags including X

    if (x >= overflow) {

      x = x - overflow;

      sr += 0x10; // set X if bit was shifted out

    }

  }

  if (x + x >= overflow) sr |= 0x8; // negative flag

  if (sr & 0x10) sr |= 1; // carry flag gets a copy of the X flag

  if (x == 0) sr |= 4; // zero flag

  return x;

}



function aline() {
  throw 10;
}

function fline() {
  throw 11;
}



// update the status register in situations that might change S bit (flips A7)



function update_sr(new_sr)

{

  if ((new_sr ^ sr) & 0x2000)

  {

    var t = a7;

    a7 = a8;

    a8 = t;

  }

  sr = new_sr;

}



function an(reg)

{

  switch (reg) {

    case 0:
      return a0;

    case 1:
      return a1;

    case 2:
      return a2;

    case 3:
      return a3;

    case 4:
      return a4;

    case 5:
      return a5;

    case 6:
      return a6;

    case 7:
      return a7;

  }

}



function dn(reg)

{

  switch (reg) {

    case 0:
      return d0;

    case 1:
      return d1;

    case 2:
      return d2;

    case 3:
      return d3;

    case 4:
      return d4;

    case 5:
      return d5;

    case 6:
      return d6;

    case 7:
      return d7;

  }

}



MODE_DREG = 0;

MODE_AREG = 1;

MODE_AREG_INDIRECT = 2;

MODE_AREG_POSTINC = 3;

MODE_AREG_PREDEC = 4;

MODE_AREG_OFFSET = 5;

MODE_AREG_INDEX = 6;

MODE_MISC = 7;

MISCMODE_SHORT = 0;

MISCMODE_LONG = 1;

MISCMODE_PC_OFFSET = 2;

MISCMODE_PC_INDEX = 3;

MISCMODE_IMM = 4;



var instruction_list = ""



// insert into instruction table

function insert_inst(opcode, code, name)

{

  instruction_list += "t[" + opcode + "] = function() { " + code + "};";

  n[opcode] = name;

}



// Check whether the given effective address is valid for common uses

function valid_source(mode, reg)

{

  return mode < 7 || reg <= 4

}



function valid_dest(mode, reg)

{

  return mode < 7 || reg <= 1

}



function valid_calc_effective_address(mode, reg)

{

  return mode == MODE_AREG_INDIRECT || mode == MODE_AREG_OFFSET || mode == MODE_AREG_INDEX || (mode == MODE_MISC && (reg <= 3))

}



// Return friendly name for a size

function size_name(size)

{

  if (size == 0) return ".B"

  if (size == 1) return ".W"

  return ".L"

}



function get_read(size)

{

  if (size == 0) return "rb"

  if (size == 1) return "rw"

  if (size == 2) return "rl"

}



function get_write(size)

{

  if (size == 0) return "wb"

  if (size == 1) return "ww"

  if (size == 2) return "wl"

}



// Return friendly text description of the addressing mode

function amode_name(mode, reg)

{

  if (mode == MODE_DREG) return "D" + (reg)

  if (mode == 1) return "A" + (reg)

  if (mode == 2) return "(A" + (reg) + ")"

  if (mode == 3) return "(A" + (reg) + ")+"

  if (mode == MODE_AREG_PREDEC) return "-(A" + (reg) + ")"

  if (mode == 5) return "nnn(A" + (reg) + ")"

  if (mode == 6) return "n(A" + (reg) + ",Dn)"

  if (mode == 7 && reg == 0) return "nnn.W"

  if (mode == 7 && reg == 1) return "nnnnn.L"

  if (mode == 7 && reg == 2) return "nnn(PC)"

  if (mode == 7 && reg == 3) return "n(PC,Dn)"

  if (mode == 7 && reg == 4) return "#"

  return "unk"

}



// Generate code to read bytes after the pc into the specified variable.  Advances the PC unless the

// sideffects variable is set to false.

function read_pc(size, dest, sideeffects)

{

  if (size == 0)

  {

    var code = "var " + dest + "=rb(pc+1);"

    return sideeffects ? code + "pc+=2;" : code

  }

  if (size == 1)

  {

    var code = "var " + dest + "=rw(pc);"

    return sideeffects ? code + "pc+=2;" : code

  }

  if (size == 2)

  {

    var code = "var " + dest + "=rl(pc);"

    return sideeffects ? code + "pc+=4;" : code

  }

}



// generate code for MOVEQ instructions

function build_moveq()

{

  for (var data = 0; data <= 255; data++)

  {

    for (var reg = 0; reg < 8; reg++)

    {

      var opcode = 0x7000 + (reg << 9) + data;

      var code = "d" + reg + " = ";

      if (data < 128)

        code += data + "; ";

      else

        code += (data + 0xFFFFFF00) + "; ";

      if (data == 0)

        code += "sr=(sr&65520)|4;"; // set zero flag

      else if (data >= 128)

        code += "sr=(sr&65520)|8;" // set negative flag

      else

        code += "sr&=65520;" // clear all flags (except X)

      insert_inst(opcode, code, "MOVEQ #" + (data >= 128 ? data - 256 : data) + ", D" + reg);

    }

  }

}



// generate code to retrieve from memory by an addressing mode (into variable s)

function amode_read(mode, reg, size, sideeffects)

{

  var increment = size + 1; // pre-decrement / post-increment size

  if (increment == 3) increment = 4;

  if (increment == 1 && reg == 7) increment = 2;



  // immediate

  if (mode == MODE_MISC && reg == MISCMODE_IMM)

    return read_pc(size, "s", sideeffects);

  //PC-relative

  if (mode == MODE_MISC && reg == MISCMODE_PC_OFFSET)

  {

    var code = read_pc(1, "o", sideeffects);

    code += "var a=pc+ewl(o)-2;"

    code += "var s=" + get_read(size) + "(a);"

    return code;

  }

  // PC-relative indexed

  if (mode == MODE_MISC && reg == MISCMODE_PC_INDEX)

  {

    var code = read_pc(1, "e", sideeffects)

    code += "var a=e&0xFF;"

    code += "if(a>127)a-=256;"

    code += "a+=pc-2;"

    code += "var x=(e>>>12)&7;"

    code += "var y=(e>32767)?an(x):dn(x);"

    code += "if(!(e&0x800))y=ewl(y);"

    code += "var s=" + get_read(size) + "(y+a);"

    return code;

  }

  // Absolute long

  if (mode == MODE_MISC && reg == MISCMODE_LONG)

  {

    code = read_pc(2, "a", sideeffects)

    code += "var s=" + get_read(size) + "(a);"

    return code;

  }

  // Absolute short

  if (mode == MODE_MISC && reg == MISCMODE_SHORT)

  {

    code = read_pc(1, "a", sideeffects)

    code += "var s=" + get_read(size) + "(ewl(a));"

    return code;

  }

  // address register indirect

  if (mode == MODE_AREG_INDIRECT)

  {

    return "var s=" + get_read(size) + "(a" + reg + ");"

  }

  // address register indirect with postincrement 

  if (mode == MODE_AREG_POSTINC)

  {

    var code = "var s=" + get_read(size) + "(a" + reg + ");"

    if (sideeffects) code += "a" + reg + "+=" + increment + ";"

    return code;

  }

  // address register indirect with predecrement

  if (mode == MODE_AREG_PREDEC)

  {

    if (sideeffects)

      return "a" + reg + "-=" + increment + ";" + "var s=" + get_read(size) + "(a" + reg + ");"

    else

      return "var s=" + get_read(size) + "(a" + reg + "-" + increment + ");"

  }

  // address register indirect with offset

  if (mode == MODE_AREG_OFFSET)

  {

    var code = read_pc(1, "o", sideeffects)

    code += "var a=a" + reg + "+ewl(o);"

    code += "var s=" + get_read(size) + "(a);"

    return code;

  }

  // address register indirect with indexing

  if (mode == MODE_AREG_INDEX)

  {

    var code = read_pc(1, "e", sideeffects)

    code += "var a=e&255;"

    code += "if (a>=128)a-=256;"

    code += "a+=a" + reg + ";"

    code += "var x=(e>>>12)&7;"

    code += "var y=(e>32767)?an(x):dn(x);"

    code += "if(!(e&0x800))y=ewl(y);"

    code += "var s=" + get_read(size) + "(y+a);"

    return code

  }

  // Data register direct

  if (mode == MODE_DREG)

  {

    if (size == 0)

      return "var s=d" + reg + "&255;"

    if (size == 1)

      return "var s=d" + reg + "&65535;"

    if (size == 2)

      return "var s=d" + reg + ";"

  }

  // a register direct

  if (mode == MODE_AREG)

  {

    if (size == 1)

      return "var s=a" + reg + "&65535;"

    if (size == 2)

      return "var s=a" + reg + ";"

  }

  return "throw 4;";

}



function effective_address_calc(mode, reg)

{

  var code = "throw 4;"

  // PC-relative

  if (mode == MODE_MISC && reg == MISCMODE_PC_OFFSET)

  {

    code = read_pc(1, "o", true)

    code += "var z=pc-2+ewl(o);"

    code += "if(z>4294967295)z-=4294967296;"

  }

  // PC-relative indexed

  if (mode == MODE_MISC && reg == MISCMODE_PC_INDEX)

  {

    code = read_pc(1, "e", true)

    code += "var a=e&0xFF;"

    code += "if(a>127)a-=256;"

    code += "a+=pc-2;"

    code += "var x=(e>>>12)&7;"

    code += "var y=(e>32767)?an(x):dn(x);"

    code += "if (!(e&0x800))y=ewl(y);"

    code += "var z=y+a;"

    code += "if(z>4294967295)z-=4294967296;"

  }

  // address register indirect with indexing

  if (mode == MODE_AREG_INDEX)

  {

    code = read_pc(1, "e", true)

    code += "var a = e&0xFF;"

    code += "if(a>127)a-=256;"

    code += "a+=a" + reg + ";"

    code += "var x=(e>>>12)&7;"

    code += "var y=(e>32767)?an(x):dn(x);"

    code += "if (!(e&0x800))y=ewl(y);"

    code += "var z=y+a;"

    code += "if(z>4294967295)z-=4294967296;"

  }

  // Absolute long

  if (mode == MODE_MISC && reg == MISCMODE_LONG)

    code = read_pc(2, "z", true)

  // Absolute short

  if (mode == MODE_MISC && reg == MISCMODE_SHORT)

  {

    code = read_pc(1, "z", true)

    code += "z=ewl(z);"

  }

  // address register indirect with offset

  if (mode == MODE_AREG_OFFSET)

  {

    code = read_pc(1, "o", true)

    code += "var z=a" + reg + "+ewl(o);"

    code += "if(z>4294967295)z-=4294967296;"

  }

  // address register indirect

  if (mode == MODE_AREG_INDIRECT)

    code = "var z=a" + reg + ";"

  return code

}



// generate code to set condition flags based on a value

function set_condition_flags_data(size, s)

{

  var code = "sr&=65520;" // clear negative, zero, overflow, carry

  code += "if(" + s + "==0)sr+=4;" // set zero flag

  if (size == 0) return code + "if(" + s + "&128)sr+=8;" // set negative flag

  if (size == 1) return code + "if(" + s + "&32768)sr+=8;" // set negative flag

  if (size == 2) return code + "if(" + s + "&0x80000000)sr+=8;" // set negative flag

}



// generate code to write the data to the effective a specified by mode and reg of size size

function amode_write(mode, reg, size, data)

{

  var increment = size + 1; // pre-decrement / post-increment size

  if (increment == 3) increment = 4;

  if (increment == 1 && reg == 7) increment = 2;



  // Absolute long

  if (mode == MODE_MISC && reg == MISCMODE_LONG)

    return "var addr = rl(pc); pc += 4; " + get_write(size) + "(addr," + data + ");"

  // Absolute short

  if (mode == MODE_MISC && reg == MISCMODE_SHORT)

    return "var addr = ewl(rw(pc)); pc += 2; " + get_write(size) + "(addr," + data + ");"

  // address register direct

  if (mode == MODE_AREG)

  {

    if (size == 2)

      return "a" + reg + "=" + data + ";"

    if (size == 1)

      return "a" + reg + "=ewl(" + data + ");"

  }

  // address register indirect

  if (mode == MODE_AREG_INDIRECT)

    return get_write(size) + "(a" + reg + "," + data + ");"

  // address register indirect with postincrement 

  if (mode == MODE_AREG_POSTINC)

    return get_write(size) + "(a" + reg + "," + data + "); a" + reg + "+=" + increment + ";"

  // address register indirect with predecrement

  if (mode == MODE_AREG_PREDEC)

    return "a" + reg + "-=" + increment + "; " + get_write(size) + "(a" + reg + "," + data + ");"

  // adress register indirect with offset

  if (mode == MODE_AREG_OFFSET)

    return read_pc(1, "o", true) + get_write(size) + "(a" + reg + "+ewl(o)," + data + ");"

  // address register indirect with indexing

  if (mode == MODE_AREG_INDEX)

  {

    var code = read_pc(1, "e", true)

    code += "var a=e%256;"

    code += "if(a>127)a-=256;"

    code += "a+=a" + reg + ";"

    code += "var x=(e>>>12)&7;"

    code += "var y=(e>32767)?an(x):dn(x);"

    code += "if(!(e&0x800))y=ewl(y);"

    code += get_write(size) + "(a+y," + data + ");"

    return code;

  }

  // Data register direct

  if (mode == MODE_DREG)

  {

    if (size == 2)

      return "d" + reg + "=" + data + ";"

    if (size == 0)

      return "d" + reg + "=((d" + reg + ">>>8)*256)+(" + data + "&255);"

    if (size == 1)

      return "d" + reg + "=((d" + reg + ">>>16)*65536)+(" + data + "&65535);"

  }

  return "throw 4;"

}



// build executors for ADDQ and SUBQ



function build_addsubq()

{

  for (offset = -8; offset < 9; offset++)

    for (mode = 0; mode < 8; mode++)

  for (reg = 0; reg < 8; reg++)

    for (size = 0; size < 3; size++)

  if (valid_dest(mode, reg) && (mode != MODE_AREG || size != 0))

  {

    if (offset == 0) continue; // do not allow add/subtract of 0

    var name = "";

    var opcode = 0;

    if (offset > 0)

    {

      opcode = 0x5000 + (offset << 9)

      if (offset == 8) opcode = 0x5000

      opcode += (size << 6) + (mode << 3) + reg

      name = "ADDQ" + size_name(size) + " #" + offset + "," + amode_name(mode, reg)

    } else

    {

      opcode = 0x5100 + ((-offset) << 9)

      if (offset == -8) opcode = 0x5100

      opcode += (size << 6) + (mode << 3) + reg

      name = "SUBQ" + size_name(size) + " #" + (-offset) + "," + amode_name(mode, reg)

    }

    var actualsize = (mode == MODE_AREG) ? 2 : size; // for address registers, always treat as long

    var code = amode_read(mode, reg, actualsize, false);

    if (mode == MODE_AREG)

    {

      // for address registers we don't set condition codes and thus can use a much simpler operation

      code += "var r=s+" + offset + ";"

      if (offset < 0) code += "if(r<0)r+=4294967296;"

      if (offset > 0) code += "if(r>4294967295)pc+=4294967296;"

    } else

    {

      // regular arithmetic with condition flags set for every other destination

      if (size == 0 && offset < 0)

        code += "var r=subb(" + (-offset) + ", s);"

      if (size == 0 && offset > 0)

        code += "var r=addb(" + offset + ", s);"

      if (size == 1 && offset < 0)

        code += "var r=subw(" + (-offset) + ", s);"

      if (size == 1 && offset > 0)

        code += "var r=addw(" + offset + ", s);"

      if (size == 2 && offset < 0)

        code += "var r=subl(" + (-offset) + ", s);"

      if (size == 2 && offset > 0)

        code += "var r=addl(" + offset + ", s);"

      // copy carry flag into X flag

      code += "sr=(sr&0xFFEF)|((sr&1)<<4);"

    }

    code += amode_write(mode, reg, actualsize, "r")

    insert_inst(opcode, code, name);

  }

}



// build all the branches for the given condition, name, and bits

function build_conditionals(condition, name, bits)

{

  var bcc_opcode = 0x6000 + (bits << 8)

  var dbcc_opcode = 0x50C8 + (bits << 8)

  var scc_opcode = 0x50C0 + (bits << 8)

  // Bcc

  for (o = 0; o < 256; o++)

  {

    var opcode = bcc_opcode + o

    var iname = "B" + name

    if (iname == "BT")

      iname = "BRA"

    if (iname == "BF")

      iname = "BSR"

    if (o == 0)

      iname = iname + ".W"

    else

      iname = iname + ".S"

    var code = "";

    if (o == 0)

    {

      code = "var o=rw(pc);"

      if (name == "F")

      {

        code += amode_write(4, 7, 2, "(pc+2)")

        code += "if(true)"

      } else

      {

        code += condition

      }

      code += "{"

      code += "pc+=ewl(o);"

      code += "if(pc>4294967295)pc-=4294967296;"

      code += "}else pc+= 2;"

    } else

    {

      if (name == "F")

        code = amode_write(4, 7, 2, "pc")

      else

        code += condition

      if (o < 128)

        code += "pc+=" + o + ";"

      else

        code += "pc-=" + (256 - o) + ";"

    }

    insert_inst(opcode, code, iname)

  }



  // DBcc

  for (reg = 0; reg < 8; reg++)

  {

    var opcode = dbcc_opcode + reg

    var code = condition + "pc+=2; else {"

    code += "var p=d" + reg + ";"

    code += "var u=(p>>>16)*65536;"

    code += "var l=p%65536;"

    code += "var m=(l - 1)&65535;"

    code += "d" + reg + "=u+m;"

    code += "if(m==65535)"

    code += "pc+=2;"

    code += "else "

    code += "pc=(pc+ewl(rw(pc)))%4294967296;}"

    insert_inst(opcode, code, "DB" + name + " D" + reg)

  }



  // Scc

  for (reg = 0; reg < 8; reg++)

    for (mode = 0; mode < 8; mode++)

  if (valid_dest(mode, reg) && mode != 1)

  {

    var opcode = scc_opcode + reg + (mode << 3)

    var code = condition + "{"

    code += amode_write(mode, reg, 0, "255")

    code += "} else {"

    code += amode_write(mode, reg, 0, "0")

    code += "}"

    insert_inst(opcode, code, "S" + name + " " + amode_name(mode, reg))

  }

}



// generate standard MOVE instructions

function build_moves(name, size, pattern)

{

  for (srcmode = 0; srcmode < 8; srcmode++)

    for (srcreg = 0; srcreg < 8; srcreg++)

  for (dstmode = 0; dstmode < 8; dstmode++)

  {

    if (size == 0 && dstmode == 1) continue // no byte moves to a registers

    for (dstreg = 0; dstreg < 8; dstreg++)

      if (valid_source(srcmode, srcreg) && valid_dest(dstmode, dstreg))

      {

        var opcode = pattern + (dstreg << 9) + (dstmode << 6) + (srcmode << 3) + srcreg

        var fullname = name + " " + amode_name(srcmode, srcreg) + "," + amode_name(dstmode, dstreg)

        var code = amode_read(srcmode, srcreg, size, true)

        code += amode_write(dstmode, dstreg, size, "s")

        // set condition codes, except when writing to a registers

        if (dstmode != 1)

          code += set_condition_flags_data(size, "s")

        insert_inst(opcode, code, fullname)

      }

  }

}



// perform a standard operation of given size between given source and dest

function build_operation(name, size, source, dest)

{

  var code = "";

  if (size == 0 && name == "ADD") code = "var r=addb(" + source + "," + dest + ");"

  if (size == 1 && name == "ADD") code = "var r=addw(" + source + "," + dest + ");"

  if (size == 2 && name == "ADD") code = "var r=addl(" + source + "," + dest + ");"

  if (size == 0 && name == "SUB") code = "var r=subb(" + source + "," + dest + ");"

  if (size == 1 && name == "SUB") code = "var r=subw(" + source + "," + dest + ");"

  if (size == 2 && name == "SUB") code = "var r=subl(" + source + "," + dest + ");"

  if (name == "OR") code += "var r=" + source + "|" + dest + ";"

  if (name == "AND") code += "var r=" + source + "&" + dest + ";"

  if (name == "EOR") code += "var r=" + source + "^" + dest + ";"

  if (name == "OR" || name == "AND" || name == "EOR")

  {

    code += "if(r<0)r+=0x100000000;"

    if (size == 0) code += "r&=255;"

    if (size == 1) code += "r&=65535;"

    code += set_condition_flags_data(size, "r")

  }

  return code;

}



// build standard calculation operations

function build_calc(name, bits)

{

  for (var dreg = 0; dreg < 8; dreg++)

    for (var reg = 0; reg < 8; reg++)

  for (var mode = 0; mode < 8; mode++)

    for (var size = 0; size < 3; size++)

  {

    var opcode = bits + (dreg << 9) + (size << 6) + (mode << 3) + reg

    // generate version with EA as source

    if (valid_source(mode, reg) && name != "EOR") // EA as source does work for EOR

    {

      var iname = +name + size_name(size) + " " + amode_name(mode, reg) + ",D" + dreg

      var code = amode_read(mode, reg, size, true)

      code += build_operation(name, size, "s", "d" + dreg + "")

      code += amode_write(MODE_DREG, dreg, size, "r")

      insert_inst(opcode, code, iname)

    }

    //  generate version with EA as destination

    if (valid_dest(mode, reg) && (mode != MODE_DREG || name == "EOR") && mode != MODE_AREG) //EA as dest does not work for registers

    {

      opcode = opcode + 0x100

      var iname = name + size_name(size) + " D" + dreg + "," + amode_name(mode, reg)

      var code = amode_read(mode, reg, size, false)

      code += build_operation(name, size, "d" + dreg, "s")

      code += amode_write(mode, reg, size, "r")

      insert_inst(opcode, code, iname)

    }

  }

}



// build multiply and divide

function build_muldiv(name, bits, calcfunc)

{

  for (var dreg = 0; dreg < 8; dreg++)

    for (var mode = 0; mode < 8; mode++)

  for (var reg = 0; reg < 8; reg++)

    if (valid_source(mode, reg) && mode != MODE_AREG)

    {

      var opcode = bits + (dreg << 9) + (mode << 3) + reg

      var iname = name + " " + amode_name(mode, reg) + ",D" + dreg

      var code = amode_read(mode, reg, 1, true)

      code += "d" + dreg + " = " + calcfunc + "(s,d" + dreg + ");"

      insert_inst(opcode, code, iname)

    }

}



// build a bit operation

function build_bit_operation(name, bits)

{

  for (srcmode = 0; srcmode < 8; srcmode++)

    for (srcreg = 0; srcreg < 8; srcreg++)

  if (valid_dest(srcmode, srcreg) ||

    (name == 'BTST' && srcmode == MODE_MISC &&

      (srcreg == MISCMODE_PC_OFFSET || srcreg == MISCMODE_PC_INDEX)))

    for (dreg = 0; dreg <= 8; dreg++) // # if this value is 8, use bit number static version

  {

    var opcode, iname, code = "";

    if (dreg == 8)

    {

      opcode = bits + (srcmode << 3) + srcreg;

      iname = name + " #nnn," + amode_name(srcmode, srcreg)

    } else

    {

      opcode = bits + (srcmode << 3) + srcreg - 0x700 + (dreg << 9);

      iname = name + " D" + dreg + "," + amode_name(srcmode, srcreg)

    }

    if (dreg == 8)

      code = read_pc(1, "b", true)

    if (srcmode <= 1)

    {

      // immediate on a register allows using bits 0-31 of the register's full value

      if (dreg == 8)

        code += "b&=31;"

      else

        code += "b=31&d" + dreg + ";"

      code += amode_read(srcmode, srcreg, 2, name == "BTST")

    } else

    {

      //  immediate elsewhere uses one byte bits 0-7

      if (dreg == 8)

        code += "b&=7;"

      else

        code += "b=7&d" + dreg + ";"

      code += amode_read(srcmode, srcreg, 0, name == "BTST")

    }

    code += "sr|=4;" // set zero flag

    code += "if (s&(1<<b))sr=sr&65531;" // clear zero flag if bit is set (nonzero)

    if (name != "BTST")

    {

      if (srcmode <= 1)

      {

        // BCLR immediate on a register allows using bits 0-31 of the register's full value

        if (name == "BCLR") code += "s&=(0xFFFFFFFF-(1<<b));"

        if (name == "BSET") code += "s|=(1<<b);"

        if (name == "BCHG") code += "s^=(1<<b);"

        code += "if(s<0)s+=4294967296;"

        code += amode_write(srcmode, srcreg, 2, "s")

      } else

      {

        // BCLR immediate elsewhere uses one byte bits 0-7

        if (name == "BCLR") code += "s&=(255-(1<<b));"

        if (name == "BSET") code += "s|=(1<<b);"

        if (name == "BCHG") code += "s^=(1<<b);"

        code += amode_write(srcmode, srcreg, 0, "s")

      }

    }

    insert_inst(opcode, code, iname)

  }

}



function build_cmp()

{

  for (size = 0; size < 3; size++)

    for (srcmode = 0; srcmode < 8; srcmode++)

  for (srcreg = 0; srcreg < 8; srcreg++)

    for (firstreg = 0; firstreg < 8; firstreg++)

  if (valid_source(srcmode, srcreg))

  {

    var opcode = 0xB000 + (firstreg << 9) + (size << 6) + (srcmode << 3) + srcreg;

    var iname = "CMP" + size_name(size) + " " + amode_name(srcmode, srcreg) + ",D" + firstreg

    var code = amode_read(srcmode, srcreg, size, true)

    code += "m=d" + firstreg + ";"

    if (size == 1) code += "m=m&0xFFFF;"

    if (size == 0) code += "m=m&0xFF;"

    if (size == 0) code += "cmpb(s,m);"

    if (size == 1) code += "cmpw(s,m);"

    if (size == 2) code += "cmpl(s,m);"

    insert_inst(opcode, code, iname)

  }

}



function build_adest()

{

  for (areg = 0; areg < 8; areg++)

    for (srcreg = 0; srcreg < 8; srcreg++)

  for (srcmode = 0; srcmode < 8; srcmode++)

    for (size = 1; size < 3; size++)

  if (valid_source(srcmode, srcreg))

  {

    var opcode = 0x90C0 + (areg << 9) + ((size - 1) << 8) + (srcmode << 3) + srcreg

    var iname = "SUBA" + size_name(size) + " " + amode_name(srcmode, srcreg) + ",A" + areg

    var code = amode_read(srcmode, srcreg, size, true)

    if (size == 1) code += " s = ewl(s);"

    code += "var r=a" + areg + " - s;"

    code += "if(r<0)r+=0x100000000;"

    code += amode_write(1, areg, 2, "r")

    insert_inst(opcode, code, iname)



    opcode = 0xB0C0 + (areg << 9) + ((size - 1) << 8) + (srcmode << 3) + srcreg

    iname = "CMPA" + size_name(size) + " " + amode_name(srcmode, srcreg) + ",A" + areg

    code = amode_read(srcmode, srcreg, size, true)

    if (size == 1) code += "s=ewl(s);"

    code += "cmpl(s,a" + areg + ");"

    insert_inst(opcode, code, iname)



    opcode = 0xD0C0 + (areg << 9) + ((size - 1) << 8) + (srcmode << 3) + srcreg

    iname = "ADDA" + size_name(size) + " " + amode_name(srcmode, srcreg) + ",A" + areg

    code = amode_read(srcmode, srcreg, size, true)

    if (size == 1) code += "s=ewl(s);"

    code += "var r=a" + areg + "+s;"

    code += "if(r>0xffffffff)r-=0x100000000;"

    code += amode_write(1, areg, 2, "r")

    insert_inst(opcode, code, iname)

  }



}



function build_shifts(name, mask, altmask, namelower)

{

  // register target version

  for (reg = 0; reg < 8; reg++)

    for (size = 0; size < 3; size++)

  for (shift = 0; shift < 8; shift++)

    for (mm = 0; mm < 2; mm++)

  {

    var actualshift = shift == 0 ? 8 : shift;

    var iname = "";

    var opcode = mask + 0x20 + (size << 6) + reg + (shift << 9);

    if (mm == 0)

    {

      opcode = opcode - 0x20;

      iname = name + size_name(size) + " #" + actualshift + ",D" + reg

    } else

    {

      iname = name + size_name(size) + " D" + shift + ",D" + reg

    }

    var shiftamount = mm == 0 ? actualshift : "d" + shift + "&31";

    var src = "";

    if (size == 0) src = "d" + reg + "&255"

    if (size == 1) src = "d" + reg + "&65535"

    if (size == 2) src = "d" + reg

    var code = amode_write(MODE_DREG, reg, size, namelower + "(" + src + "," + shiftamount + "," + size + ")")

    insert_inst(opcode, code, iname)

  }

  // EA target version

  for (reg = 0; reg < 8; reg++)

    for (mode = 0; mode < 8; mode++)

  if (valid_dest(mode, reg) && mode != MODE_DREG && mode != MODE_AREG)

  {

    var opcode = altmask + (mode << 3) + reg;

    var iname = name + ".W " + amode_name(mode, reg)

    var code = amode_read(mode, reg, 1, false)

    code += amode_write(mode, reg, 1, namelower + "(s,1,1)")

    insert_inst(opcode, code, iname)

  }

}



function build_immediate(name, mask, operation)

{

  for (reg = 0; reg < 8; reg++)

    for (mode = 0; mode < 8; mode++)

  for (size = 0; size < 3; size++)

    if ((valid_dest(mode, reg) && mode != MODE_AREG) || (mode == MODE_MISC && reg == 4 && size < 2 && operation != ""))

    {

      var opcode = mask + (size << 6) + (mode << 3) + reg

      var mode_name = amode_name(mode, reg)

      if (mode == MODE_MISC && reg == 4 && size == 0) mode_name = "CCR"

      if (mode == MODE_MISC && reg == 4 && size == 1) mode_name = "SR"

      var iname = name + size_name(size) + " #nnn," + mode_name

      var code = read_pc(size, "m", true)

      if (mode == MODE_MISC && reg == 4)

      {

        if (size == 0 && name == "ANDI") code += "m|=0xFF00;"

        code += "update_sr(sr" + operation.substring(7, 8) + "m);"

      } else

      {

        code += amode_read(mode, reg, size, false)

        if (operation != "")

        {

          //if (name == "ANDI") code += "if (m==0xE00000) tracecount=20;"; 

          code += operation;

          code += set_condition_flags_data(size, "r")

        } else

        {

          code += "var r=" + name.substring(0, 3).toLowerCase() + size_name(size).substring(1, 2).toLowerCase() + "(m,s);"

        }

        code += amode_write(mode, reg, size, "r")

      }

      insert_inst(opcode, code, iname)

    }

}



function build_ext(name, bits)

{

  for (src = 0; src < 8; src++)

    for (dst = 0; dst < 8; dst++)

  for (size = 0; size < 3; size++)

    for (mem = 0; mem < 2; mem++)

  {

    var opcode = bits + (dst << 9) + (size << 6) + (mem << 3) + src

    var iname = name + size_name(size)

    if (mem == 0)

      iname += " D" + src + ",D" + dst + "'"

    else

      iname += " -(A" + src + "),-(A" + dst + ")'"

    mode = mem == 0 ? MODE_DREG : mode = MODE_AREG_PREDEC

    var code = amode_read(mode, src, size, true)

    code += "var c=s;"

    code += amode_read(mode, dst, size, false)

    code += "var n=" + name.toLowerCase() + "(c,s," + size + ");"

    code += amode_write(mode, dst, size, "n")

    insert_inst(opcode, code, iname)

  }

}



function build_not_neg()

{

  for (size = 0; size < 3; size++)

    for (srcmode = 0; srcmode < 8; srcmode++)

  for (srcreg = 0; srcreg < 8; srcreg++)

    if (valid_dest(srcmode, srcreg))

    {

      var opcode = 0x4600 + (size << 6) + (srcmode << 3) + srcreg;

      var iname = "NOT" + size_name(size) + " " + amode_name(srcmode, srcreg)

      var code = amode_read(srcmode, srcreg, size, false)

      if (size == 0) code += "s=255-s;"

      if (size == 1) code += "s=65535-s;"

      if (size == 2) code += "s=0xFFFFFFFF-s;"

      code += set_condition_flags_data(size, "s")

      code += amode_write(srcmode, srcreg, size, "s")

      insert_inst(opcode, code, iname)



      // *** should fix overflow here sometime

      opcode = 0x4400 + (size << 6) + (srcmode << 3) + srcreg;

      iname = "NEG" + size_name(size) + " " + amode_name(srcmode, srcreg)

      code = amode_read(srcmode, srcreg, size, false)

      code += "sr &= 0xFFE0;"

      if (size == 0) code += "var r=s==0?0:256-s;if(r>127)sr|=8;"

      if (size == 1) code += "var r=s==0?0:65536-s;if(r>=32767)sr|=8;"

      if (size == 2) code += "var r=s==0?0:0x100000000-s;if(r>0x7fffffff)sr|=8;"

      code += "if(r==0)sr|=4;else sr|=17;" // set zero flag for zero, extend and carry otherwise

      code += amode_write(srcmode, srcreg, size, "r")

      insert_inst(opcode, code, iname)



      opcode = 0x4000 + (size << 6) + (srcmode << 3) + srcreg;

      iname = "NEGX" + size_name(size) + " " + amode_name(srcmode, srcreg)

      code = amode_read(srcmode, srcreg, size, false)

      code += "	if(sr&0x10)s++;"

      if (size == 0) code += "var r=256-s;"

      if (size == 1) code += "var r=0x10000-s;"

      if (size == 2) code += "var r=0x100000000-s;if(r>0xffffffff)r=0;"

      code += set_condition_flags_data(size, "r")

      code += amode_write(srcmode, srcreg, size, "r")

      insert_inst(opcode, code, iname)

    }

}



function build_clr_tst()

{

  for (size = 0; size < 3; size++)

    for (srcmode = 0; srcmode < 8; srcmode++)

  for (srcreg = 0; srcreg < 8; srcreg++)

    if (valid_dest(srcmode, srcreg) && srcmode != MODE_AREG)

    {

      var opcode = 0x4200 + (size << 6) + (srcmode << 3) + srcreg;

      var iname = "CLR" + size_name(size) + " " + amode_name(srcmode, srcreg)

      var code = amode_write(srcmode, srcreg, size, "0")

      code += "sr|=4;"

      insert_inst(opcode, code, iname)



      opcode = 0x4a00 + (size << 6) + (srcmode << 3) + srcreg;

      iname = "TST" + size_name(size) + " " + amode_name(srcmode, srcreg)

      code = amode_read(srcmode, srcreg, size, true)

      code += set_condition_flags_data(size, "s")

      insert_inst(opcode, code, iname)

    }

}



function build_lea()

{

  for (srcmode = 0; srcmode < 8; srcmode++)

    for (srcreg = 0; srcreg < 8; srcreg++)

  for (reg = 0; reg < 8; reg++)

    if (valid_calc_effective_address(srcmode, srcreg))

    {

      var opcode = 0x41C0 + (reg << 9) + (srcmode << 3) + srcreg;

      var iname = "LEA " + amode_name(srcmode, srcreg) + ",A" + reg

      var code = effective_address_calc(srcmode, srcreg)

      code += "a" + reg + "=z;"

      insert_inst(opcode, code, iname)

    }

}



function build_cmpi()

{

  for (size = 0; size < 3; size++)

    for (srcmode = 0; srcmode < 8; srcmode++)

  for (srcreg = 0; srcreg < 8; srcreg++)

    if (valid_dest(srcmode, srcreg))

    {

      var opcode = 0xC00 + (size << 6) + (srcmode << 3) + srcreg;

      var iname = "CMPI" + size_name(size) + " #imm," + amode_name(srcmode, srcreg)

      var code = read_pc(size, "subtrahend", true)

      code += amode_read(srcmode, srcreg, size, true)

      if (size == 0) code += "subb(subtrahend, s);"

      if (size == 1) code += "subw(subtrahend, s);"

      if (size == 2) code += "subl(subtrahend, s);"

      insert_inst(opcode, code, iname)

    }

}



function build_movem()

{

  for (reg = 0; reg < 8; reg++)

    for (mode = 0; mode < 8; mode++)

  for (size = 1; size < 3; size++)

  {

    var actualsize = size * 2

    // to registers

    if (mode == MODE_AREG_INDIRECT ||

      mode == MODE_AREG_POSTINC ||

      mode == MODE_AREG_OFFSET ||

      mode == MODE_AREG_INDEX ||

      (mode == MODE_MISC &&

        (reg == MISCMODE_SHORT ||

          reg == MISCMODE_LONG ||

          reg == MISCMODE_PC_OFFSET ||

          reg == MISCMODE_PC_INDEX)))

    {

      var opcode = 0x4c80 + ((size - 1) << 6) + (mode << 3) + reg

      var iname = "MOVEM" + size_name(size + 1) + " " + amode_name(mode, reg) + ",regs"

      var code = read_pc(1, "regs", true)

      if (mode == MODE_AREG_POSTINC)

        code += "load_multiple_postinc(" + reg + ",regs," + size + ");"

      else

      {

        code += effective_address_calc(mode, reg);

        code += "load_multiple(z,regs," + size + ");"

      }

      insert_inst(opcode, code, iname)

    }



    // from registers

    if (mode == MODE_AREG_INDIRECT ||

      mode == MODE_AREG_PREDEC ||

      mode == MODE_AREG_OFFSET ||

      mode == MODE_AREG_INDEX ||

      (mode == MODE_MISC &&

        (reg == MISCMODE_SHORT ||

          reg == MISCMODE_LONG)))

    {

      var opcode = 0x4880 + ((size - 1) << 6) + (mode << 3) + reg

      var iname = "MOVEM" + size_name(size) + " regs," + amode_name(mode, reg)

      var code = read_pc(1, "regs", true)

      if (mode == MODE_AREG_PREDEC)

        code += "store_multiple_predec(" + reg + ", regs, " + size + ");"

      else

      {

        code += effective_address_calc(mode, reg)

        code += "store_multiple(z, regs, " + size + ");"

      }

      insert_inst(opcode, code, iname)

    }

  }

}



function build_cmpm()

{

  for (src = 0; src < 8; src++)

    for (dest = 0; dest < 8; dest++)

  for (size = 0; size < 3; size++)

  {

    var opcode = 0xB108 + (dest << 9) + (size << 6) + src

    var iname = "CMPM" + size_name(size) + " (A" + src + ")+,(A" + dest + ")+'"

    var code = amode_read(MODE_AREG_POSTINC, src, size, true)

    code += "var u=s;"

    code += amode_read(MODE_AREG_POSTINC, dest, size, true)

    if (size == 0) code += "cmpb(u,s);"

    if (size == 1) code += "cmpw(u,s);"

    if (size == 2) code += "cmpl(u,s);"

    insert_inst(opcode, code, iname)

  }

}



function build_bcd()

{

  for (src = 0; src < 8; src++)

    for (dest = 0; dest < 8; dest++)

  for (m = 1; m >= 0; m--)

    for (sub = 0; sub <= 1; sub++)

  {

    var operation = sub == 0 ? "ABCD" : "SBCD"

    var opcode = 0x8100 + (dest << 9) + src

    if (operation == "ABCD") opcode += 0x4000

    var iname = ""

    if (m != 0)

    {

      opcode += 8

      iname = operation + " -(A" + src + "),-(A" + dest

    } else

      iname = operation + " D" + src + ",D" + dest

    var code = ""

    if (m != 0)

    {

      code = amode_read(MODE_AREG_PREDEC, src, 0, true)

      code += "var other = s;"

      code += amode_read(MODE_AREG_PREDEC, dest, 0, true)

      code += amode_write(MODE_AREG_INDIRECT, dest, 0, operation.toLowerCase() + "(s,other)")

    } else

      code = "d" + dest + "+=" + operation.toLowerCase() + "(d" + dest + ",d" + src + ")-d" + dest + "&0xFF;"

    insert_inst(opcode, code, iname)

  }

}



function build_movesrccr()

{

  for (srcmode = 0; srcmode < 8; srcmode++)

    for (srcreg = 0; srcreg < 8; srcreg++)

  {

    if (valid_source(srcmode, srcreg) && srcmode != MODE_AREG)

    {

      var opcode = 0x46C0 + (srcmode << 3) + srcreg;

      var iname = "'MOVE " + amode_name(srcmode, srcreg) + ",SR"

      insert_inst(opcode, amode_read(srcmode, srcreg, 1, true) + "update_sr(s);", iname)



      opcode = 0x44C0 + (srcmode << 3) + srcreg;

      iname = "MOVE " + amode_name(srcmode, srcreg) + ",CCR"

      insert_inst(opcode, amode_read(srcmode, srcreg, 0, true) + "sr = (sr&0xFF00) + s;", iname)

    }

    if (valid_dest(srcmode, srcreg) && srcmode != MODE_AREG)

    {

      var opcode = 0x40C0 + (srcmode << 3) + srcreg;

      var iname = "MOVE SR," + amode_name(srcmode, srcreg)

      insert_inst(opcode, amode_write(srcmode, srcreg, 1, "sr"), iname)

    }

  }

}



function build_exchange(xtype, ytype, bits)

{

  for (x = 0; x < 8; x++)

    for (y = 0; y < 8; y++)

  {

    var opcode = bits + (x << 9) + y

    var iname = "EXG " + xtype + x + "," + ytype + y

    var xstr = xtype.toLowerCase() + x

    var ystr = ytype.toLowerCase() + y

    var code = "var e=" + xstr + ";"

    code += xstr + "=" + ystr + ";"

    code += ystr + "=e;"

    insert_inst(opcode, code, iname)

  }

}



function build_jmpjsr()

{

  for (var mode = 0; mode < 8; mode++)

    for (var reg = 0; reg < 8; reg++)

  if (valid_calc_effective_address(mode, reg))

    for (jsr = 1; jsr >= 0; jsr--)

  {

    var opcode = 0x4EC0 + (mode << 3) + reg - jsr * 0x40;

    var iname = (jsr == 1 ? "JSR" : "JMP") + amode_name(mode, reg)

    var code = effective_address_calc(mode, reg)

    if (jsr == 1)

      code += amode_write(4, 7, 2, "pc")

    code += "pc=z;"

    insert_inst(opcode, code, iname)

  }

}



function build_pea()

{

  for (srcmode = 0; srcmode < 8; srcmode++)

    for (srcreg = 0; srcreg < 8; srcreg++)

  if (valid_calc_effective_address(srcmode, srcreg))

  {

    var opcode = 0x4840 + (srcmode << 3) + srcreg;

    var iname = "PEA " + amode_name(srcmode, srcreg)

    insert_inst(opcode, effective_address_calc(srcmode, srcreg) + amode_write(4, 7, 2, "z"), iname)

  }

}



function build_swap()

{

  for (var reg = 0; reg < 8; reg++)

  {

    var code = "var l = d" + reg + "&65535;"

    code += "var h = d" + reg + " >>> 16;"

    code += "d" + reg + " = (l * 65536) + h;"

    insert_inst(0x4840 + reg, code, "SWAP D" + reg)

  }

}



// fill default instruction table, initially all unimplemented instructions 



// fill unhandled instructions by default

for (var i = 0; i < 65536; i++) {

  t[i] = make_unhandled(i);

  n[i] = "UNKNOWN";

}



for (var i = 0xA000; i <= 0xAFFF; i++) {

  t[i] = aline;

  n[i] = "ALINE " + to_hex(i, 3);

}



for (var i = 0xF000; i <= 0xFFFF; i++) {

  t[i] = fline;

  n[i] = "FLINE " + to_hex(i, 3);

}



build_moveq();

build_addsubq();

// bit patterns specifying size are different for MOVE than most other instructions, and Sybex book has them wrong!

build_moves("MOVE.L", 2, 0x2000);

build_moves("MOVE.W", 1, 0x3000);

build_moves("MOVE.B", 0, 0x1000);

build_conditionals("if(true)", "T", 0)

build_conditionals("if(false)", "F", 1)

build_conditionals("if(!(sr&5))", "HI", 2)

build_conditionals("if(sr&5)", "LS", 3)

build_conditionals("if(!(sr&1))", "CC", 4)

build_conditionals("if(sr&1)", "CS", 5)

build_conditionals("if(!(sr&4))", "NE", 6)

build_conditionals("if(sr&4)", "EQ", 7)

build_conditionals("if(!(sr&2))", "VC", 8)

build_conditionals("if(sr&2)", "VS", 9)

build_conditionals("if(!(sr&8))", "PL", 10)

build_conditionals("if(sr&8)", "MI", 11)

build_conditionals("if(((sr&10)==0)||((sr&10)==10))", "GE", 12)

build_conditionals("if(((sr&10)==8)||((sr&10)==2))", "LT", 13)

build_conditionals("if((((sr&10)==0)||((sr&10)==10))&(!(sr&4)))", "GT", 14)

build_conditionals("if((sr&4)||((sr&10)==8)||((sr&10)==2))", "LE", 15)

build_calc("EOR", 0xB000)

build_calc("ADD", 0xD000)

build_calc("AND", 0xC000)

build_calc("SUB", 0x9000)

build_calc("OR", 0x8000)

build_muldiv("DIVS", 0x81C0, "divs")

build_muldiv("DIVU", 0x80C0, "divu")

build_muldiv("MULS", 0xC1C0, "muls")

build_muldiv("MULU", 0xC0C0, "mulu")

build_bit_operation("BCLR", 0x880)

build_bit_operation("BTST", 0x800)

build_bit_operation("BCHG", 0x840)

build_bit_operation("BSET", 0x8c0);

build_shifts("ASL", 0xE100, 0xE1C0, "asl")

build_shifts("ASR", 0xE000, 0xE0C0, "asr")

build_shifts("LSL", 0xE108, 0xE3C0, "lsl")

build_shifts("LSR", 0xE008, 0xE2C0, "lsr")

build_shifts("ROXL", 0xE110, 0xE5C0, "roxl")

build_shifts("ROXR", 0xE010, 0xE4C0, "roxr")

build_shifts("ROL", 0xE118, 0xE7C0, "rol")

build_shifts("ROR", 0xE018, 0xE6C0, "ror")

build_cmp()

build_adest()

build_immediate("ORI", 0, "var r=s|m;")

build_immediate("ANDI", 0x200, "var r=s&m;")

build_immediate("EORI", 0xA00, "var r=s^m;")

build_immediate("ADDI", 0x600, "")

build_immediate("SUBI", 0x400, "")

build_ext("ADDX", 0xD100)

build_ext("SUBX", 0x9100)

build_not_neg()

build_clr_tst()

build_lea()

build_cmpi()

build_movem()

build_cmpm()

build_bcd()

build_exchange("D", "D", 0xC140)

build_exchange("A", "A", 0xC148)

build_exchange("D", "A", 0xC188)

insert_inst(0x4E75, "pc=rl(a7);a7+=4;", "RTS")

insert_inst(0x4E71, "", "NOP")

insert_inst(0x4E73, "var s=rw(a7);a7+=2;pc=rl(a7);a7+=4;update_sr(s)", "RTE")

build_movesrccr()

build_jmpjsr()

build_pea()

build_swap()

for (vector = 0; vector < 16; vector++)

  insert_inst(0x4E40 + vector, "throw(" + (32 + vector) + ")", "TRAP #" + vector)

for (var reg = 0; reg < 8; reg++)

{

  insert_inst(0x4E60 + reg, "if(sr&0x2000==0)throw 8;a8=a" + reg, "MOVE A" + reg + ",USP")

  insert_inst(0x4E68 + reg, "if(sr&0x2000==0)throw 8;a" + reg + "=a8", "MOVE USP,A" + reg)

  insert_inst(0x4880 + reg, "d" + reg + "=((d" + reg + ">>>16)*65536)+ebw(d" + reg + ")", "EXT.W D" + reg)

  insert_inst(0x48C0 + reg, "d" + reg + "=ewl(d" + reg + ")", "EXT.L D" + reg)

  var linkcode = "a7-=4; wl(a7,a" + reg + "); var o=rw(pc); pc+=2; a" + reg + "=a7; a7+=(o<0x8000?o:o-0x10000);"

  insert_inst(0x4e50 + reg, linkcode, "LINK #nnnn,A" + reg)

  var unlkcode = "a7 = a" + reg + "; var s=rl(a7); a7+=4; a" + reg + " = s;"

  insert_inst(0x4e58 + reg, unlkcode, "UNLK A " + reg)

}

eval(instruction_list);





var unknown = 0

for (var i = 0; i < 65536; i++)

  if (n[i] == "UNKNOWN")

    unknown++;

console.log("number of unknown opcodes is " + unknown)





// read a hardware register (byte)

function read_hreg(reg)

{

  if (reg == 0x600000) return 0x84;

  if (reg == 0x600001) return vectorprotect ? 4 : 0;

  if (reg == 0x60000e) return 0x10;

  if (reg == 0x600015) return interrupt_control; // default value for interrupt / display control

  if (reg == 0x600017) return timer_current; // programmable timer

  if (reg == 0x600019) return key_mask; // which keys are readable

  if (reg == 0x60001a) return 0xFF; // ON key read - treat as not pressed

  if (reg == 0x60001b) { // keyboard read - treat as no keys pressed

    var result = 0xFF;

    var keymask = keymaskhigh * 256 + keymasklow;

    for (var row = 0; row <= 9; row++)

    {

      if ((keymask & (1 << row)) == 0)

      {

        for (var col = 0; col < 8; col++)

        {

          if (keystatus[row * 8 + col] == 1)

          {

            result &= (0xFF - (1 << col));

          }

        }

      }

    }

    return result;

  }

  if (reg == 0x60000c)

  {

    //console.log("read link configuation: " + to_hex(link_config, 2));

    return link_config;

  }

  if (reg == 0x60000f)

  {

    if (link_incoming_queue.length > 0 && typeof(link_incoming_queue[0]) == "number")

    {

      //console.log("reading link buffer: " + to_hex(link_incoming_queue[0], 2));

      return link_incoming_queue.shift();

    } else

    {

      //console.log("tried to read link buffer, returned 0 because no data");

      return 0;

    }

  }

  if (reg == 0x60000d)

  {

    var status = 2;

    if (link_incoming_queue.length > 0 && typeof(link_incoming_queue[0]) == "number") status |= 0x30;

    else if (link_config & 2) status |= 0x50;

    //console.log("read link status: " + to_hex(status, 2));

    return status;

  }

  if (reg == 0x60001d) return 1; // contrast setting

  return 0;

}



// write a hardware register (byte)

function write_hreg(reg, value)

{

  if (reg == 0x600010) lcd_address_high = value;

  if (reg == 0x600011) lcd_address_low = value;

  if (reg == 0x600013) screen_height = value;

  if (reg == 0x600018) keymaskhigh = value;

  if (reg == 0x600019) keymasklow = value;

  if (reg == 0x600017) {
    timer_current = value;
    timer_min = value;
  } // programmable timer

  if (reg == 0x60000c)

  {

    link_config = value;

    if (value & 2 == 0) transmit_finished = false;

    //console.log("writing link configuation: " + to_hex(link_config, 2));

  }

  if (reg == 0x60000f)

  {

    link_outgoing_queue.push(value);

    //console.log("writing to link buffer: " + to_hex(value, 2));

    transmit_finished = true;

  }

  if (reg == 0x600005)

  {

    wakemask = value;

    ///throw "STOP";

  }

  if (reg == 0x600015)

  {

    interrupt_control = value;

    switch ((interrupt_control >> 4) & 0x3)

    {

      case 0:

        interrupt_rate = 0x20;

        break;

      case 1:

        interrupt_rate = 0x200;

        break;

      case 2:

        interrupt_rate = 0x1000;

        break;

      case 3:

        interrupt_rate = 0x40000;

        break;

    }

    console.log("writing interrupt_control: " + to_hex(interrupt_control, 2));

  }

}



// read from memory, size 0 for byte, 1 for word, 2 for long

// todo rearrange with & after long recurse, odd check in size=1, else btw 0 and 1

function read_memory(address, size)

{

  if (size == 1) return rw(address);

  if (size == 2) return rl(address);

  return rb(address);

}



function rl(address)

{

  var high_word = rw(address);

  var low_word = rw(address + 2);

  return high_word * 65536 + low_word;

}



function rw(address)

{

  address = address & 0xFFFFFF;

  if (address < 0x200000)

    return ram[(address & 0x3FFFF) / 2];

  else if (address < 0x400000)

    return 0x1400;

  else if (address < 0x600000)

    return rom[(address % 0x200000) / 2];

  else return read_hreg(address) * 256 + read_hreg(address + 1);

}



function rb(address)

{

  address = address & 0xFFFFFF;

  if (address < 0x200000)

  {

    address &= 0x3FFFF;

    if (address % 2 == 0)

      return ram[address / 2] >>> 8;

    else

      return ram[address >> 1] & 0xFF;

  } else if (address < 0x400000)

    return (address & 1) ? 0 : 0x14;

  else if (address < 0x600000)

    if (address % 2 == 0)

      return rom[(address - 0x400000) / 2] >>> 8;

    else

      return rom[(address - 0x400001) / 2] & 0xFF;

  else if (address < 0x800000) {

    return read_hreg(address);

  }

  return 0;

}



function write_memory(address, size, value)

{

  if (size == 1) ww(address, value);

  if (size == 2) wl(address, value);

  if (size == 0) wb(address, value);

}



function wl(address, value)

{

  ww(address, value >>> 16);

  ww(address + 2, value & 0xFFFF);

}



function ww(address, value)

{

  //if (value < 0) console.log ("writing " + value + " to " + address + " PC " + pc);

  //if (value > 65535) console.log ("writing " + value + " to " + address + " PC " + pc);



  address = address & 0xFFFFFF;

  if ((address % 2) != 0) throw 3; // address error

  if (address < 0x200000) {

    ram[(address & 0x3FFFF) / 2] = value;

  } else if (address >= 0x600000) {

    write_hreg(address, (value >> 8) & 0xFF);

    write_hreg(address + 1, value & 0xFF);

  }

}



function wb(address, value)

{

  //if (value < 0) console.log ("writing byte " + value + " to " + address + " PC " + pc);

  //if (value > 255) console.log ("writing byte " + value + " to " + address + " PC " + pc);



  address = address & 0xFFFFFF;

  if (address < 0x200000)

  {

    address &= 0x3FFFF;

    if (address % 2 == 0)

      ram[address / 2] = (ram[address / 2] & 0xFF) + (value * 256);

    else

      ram[address >> 1] = (ram[address >> 1] & 0xFF00) + value;

  } else if (address >= 0x600000)

    write_hreg(address, value & 0xFF);

}



// MOVEM handlers

function store_multiple(address, mask, size)

{

  for (var reg = 0; reg <= 15; reg++) {

    var enabled = mask & 1;

    mask >>>= 1;

    if (enabled) {

      var value = reg < 8 ? eval("d" + reg) : eval("a" + (reg - 8));

      write_memory(address, size, value);

      address += size * 2;

    }

  }

}

function store_multiple_predec(reg, mask, size)

{

  var realreg = "a" + reg;

  for (var reg = 15; reg >= 0; reg--) {

    var enabled = mask & 1;

    mask >>>= 1;

    if (enabled) {

      var value = reg < 8 ? eval("d" + reg) : eval("a" + (reg - 8));

      eval(realreg + "-=" + size * 2);

      write_memory(eval(realreg), size, value);

    }

  }

}

function load_multiple(address, mask, size)

{

  for (var reg = 0; reg <= 15; reg++) {

    var enabled = mask & 1;

    mask >>>= 1;

    if (enabled) {

      var value = read_memory(address, size);

      if (size == 1) value = ewl(value);

      address += size * 2;

      if (reg < 8) eval("d" + reg + "=" + value);
      else eval("a" + (reg - 8) + "=" + value)

    }

  }

}

function load_multiple_postinc(reg, mask, size)

{

  var realreg = "a" + reg;

  for (var reg = 0; reg <= 15; reg++) {

    var enabled = mask & 1;

    mask >>>= 1;

    if (enabled) {

      var value = read_memory(eval(realreg), size);

      if (size == 1) value = ewl(value);

      eval(realreg + "+=" + size * 2);

      if (reg < 8) eval("d" + reg + "=" + value);
      else eval("a" + (reg - 8) + "=" + value)

    }

  }

}



var bitmap = false;

var context = false;



function draw_screen()

{

  var address = (lcd_address_low + (lcd_address_high << 8)) << 2;

  var buff = bitmap.data;



  var pixel = frame;

  for (var y = 0; y < 128; y++)

    for (var x = 0; x < 15; x++) {

    var b = ram[address++];

    for (var bit = 15; bit >= 0; bit--) {

      var color = b & 0x8000 ? 0 : 0x50;

      b <<= 1;

      calcscreen[pixel] = color;

      pixel += 3;

    }

  }



  frame++;

  if (frame == 3) frame = 0;



  pixel = 0;

  var p = 0;

  for (var y = 0; y < 3840 * 128; y += 3840) {

    for (var x = 0; x < 240; x++) {

      var color = calcscreen[pixel++] + calcscreen[pixel++] + calcscreen[pixel++];

      buff[p] = color;

      buff[p + 1] = color;

      buff[p + 2] = color;

      buff[p + 4] = color;

      buff[p + 5] = color;

      buff[p + 6] = color;

      buff[p + 1920] = color;

      buff[p + 1921] = color;

      buff[p + 1922] = color;

      buff[p + 1924] = color;

      buff[p + 1925] = color;

      buff[p + 1926] = color;

      p += 8;

    }

    p += 1920;

  }



  context.putImageData(bitmap, 0, 0);

};



function create_button(shape, coords, keynumber)

{

  var map = document.getElementById('map');

  var area = document.createElement('area');

  area.shape = shape;

  area.coords = coords;

  area.onmousedown = function() {
    keystatus[keynumber] = 1;
  }

  area.ontouchstart = function() {
    keystatus[keynumber] = 1;
  }

  area.onmouseup = function() {
    keystatus[keynumber] = 0;
  }

  area.ontouchend = function() {
    keystatus[keynumber] = 0;
  }

  area.ontouchleave = function() {
    keystatus[keynumber] = 0;
  }

  area.ontouchcancel = function() {
    keystatus[keynumber] = 0;
  }

  map.appendChild(area);

}



function initemu()

{

  var elem = document.getElementById('screen');

  context = elem.getContext('2d');



  if (context.createImageData)

    bitmap = context.createImageData(480, 256);

  else if (context.getImageData)

    bitmap = context.getImageData(0, 0, 960, 512);

  else

    bitmap = {
    'width': 480,
    'height': h,
    'data': new Array(480 * 256 * 4)
  };



  create_button("rect", "140,52,193,112", 3); // LOCK (hand)

  create_button("rect", "871,69,920,108", 5); // Up

  create_button("rect", "871,157,920,196", 7); // Down

  create_button("rect", "834,110,872,156", 4); // Left

  create_button("rect", "921,110,971,156", 6); // Right	

  create_button("rect", "724,55,768,95", 0); // 2nd (by cursor pad)

  create_button("rect", "200,497,246,527", 0); // 2nd (lower left) 46,30

  create_button("rect", "137,497,183,527", 1); // diamond

  create_button("rect", "74,450,120,480", 2); // shift

  create_button("rect", "137,451,183,481", 9); // Z

  create_button("rect", "168,401,214,431", 10); // S

  create_button("rect", "136,353,182,393", 11); // W

  create_button("rect", "141,271,184,311", 12); // F8 42,40

  create_button("rect", "724,453,770,483", 13); // 1

  create_button("rect", "784,453,830,483", 14); // 2

  create_button("rect", "845,453,891,483", 15); // 3

  create_button("rect", "200,450,246,480", 17); // X

  create_button("rect", "232,402,278,432", 18); // D

  create_button("rect", "199,354,245,384", 19); // E

  create_button("rect", "75,218,184,259", 20); // F3

  create_button("rect", "724,405,770,435", 21); // 4

  create_button("rect", "785,405,830,435", 22); // 5

  create_button("rect", "845,405,891,431", 23); // 6

  create_button("rect", "264,499,310,529", 24); // STO

  create_button("rect", "263,450,309,480", 25); // C

  create_button("rect", "294,403,340,433", 26); // F

  create_button("rect", "264,354,310,384", 27); // R

  create_button("rect", "141,219,184,259", 28); // F7

  create_button("rect", "724,357,770,387", 29); // 7

  create_button("rect", "785,357,830,387", 30); // 8

  create_button("rect", "845,357,891,387", 31); // 9

  create_button("rect", "327,499,495,529", 32); // SPACE

  create_button("rect", "326,450,372,480", 33); // V

  create_button("rect", "357,403,403,433", 34); // G

  create_button("rect", "327,354,373,384", 35); // T

  create_button("rect", "75,168,118,208", 36); // F2

  create_button("rect", "723,306,768,336", 37); // (

  create_button("rect", "784,306,830,336", 38); // )

  create_button("rect", "844,307,890,337", 39); // ,

  create_button("rect", "904,307,950,337", 40); // /

  create_button("rect", "388,452,434,483", 41); // B

  create_button("rect", "421,403,467,433", 42); // H

  create_button("rect", "389,355,435,385", 43); // Y

  create_button("rect", "141,168,184,208", 44); // F6

  create_button("rect", "168,401,214,431", 45); // SIN

  create_button("rect", "724,260,770,290", 46); // COS

  create_button("rect", "784,260,830,290", 47); // TAN

  create_button("rect", "905,260,951,290", 48); // ^

  create_button("rect", "453,451,499,481", 49); // N

  create_button("rect", "484,403,530,433", 50); // J

  create_button("rect", "452,355,498,385", 51); // U

  create_button("rect", "75,119,118,159", 52); // F1

  create_button("rect", "723,211,769,241", 53); // LN

  create_button("rect", "846,201,949,239", 54); // ENTER2 (BY CUROSR)

  create_button("rect", "642,356,688,386", 55); // P

  create_button("rect", "516,500,562,530", 56); // =

  create_button("rect", "515,451,561,481", 57); // M

  create_button("rect", "547,403,593,433", 58); // K

  create_button("rect", "516,356,562,386", 59); // I

  create_button("rect", "141,119,284,159", 60); // F5

  create_button("rect", "724,163,790,193", 61); // CLEAR

  create_button("rect", "785,164,828,237", 62); // APPS

  create_button("rect", "905,357,951,387", 63); // *

  create_button("rect", "579,499,625,529", 64); // BACKSPACE

  create_button("rect", "578,451,624,481", 65); // THETA

  create_button("rect", "610,403,656,433", 66); // L

  create_button("rect", "579,356,623,386", 67); // O

  create_button("rect", "905,453,961,483", 68); // +

  create_button("rect", "724,115,770,145", 69); // MODE

  create_button("rect", "785,59,825,139", 70); // ESC

  create_button("rect", "904,404,950,434", 72); // -

  create_button("rect", "905,500,938,538", 73); // ENTER1 (numeric)

  create_button("rect", "624,454,685,528", 73); // ENTER1 (alphabetic)

  create_button("rect", "106,401,152,431", 74); // A

  create_button("rect", "74,353,120,383", 75); // Q

  create_button("rect", "75,271,118,311", 76); // F4

  create_button("rect", "724,501,770,531", 77); // 0

  create_button("rect", "784,502,830,532", 78); // .

  create_button("rect", "845,501,891,531", 79); // (-)



  // set all alpha channels to 255 (fully opaque)

  for (var x = 3; x < bitmap.data.length; x++) bitmap.data[x] = 255;



  initialize_calculator();

  interval = setInterval("emu_main_loop()", 11);



  for (key = 0; key < 80; key++) keystatus[key] = 0;



  document.onkeydown = handle_keys;

  document.onkeyup = handle_keys;

};



function handle_keys(event)

{

  var e = event || window.event;

  e.preventDefault();

  var value;

  switch (e.type) {

    case 'keydown':

      value = 1;

      break;

    case 'keyup':

      value = 0;

      break;

    default:

      return true;

  }

  switch (e.keyCode)

  {

    case 113:
      keystatus[36] = value;
      break; // F2

    case 112:
      keystatus[52] = value;
      break; // F1

    case 114:
      keystatus[20] = value;
      break; // F3

    case 115:
      keystatus[78] = value;
      break; // F4

    case 116:
      keystatus[60] = value;
      break; // F5

    case 117:
      keystatus[44] = value;
      break; // F6

    case 118:
      keystatus[28] = value;
      break; // F7

    case 119:
      keystatus[12] = value;
      break; // F1

    case 27:
      keystatus[70] = value;
      break; // ESC



    case 59:
      keystatus[81] = value;
      break; // ;, simulated (-) (Firefox, Opera)

    case 186:
      keystatus[81] = value;
      break; // ;, simulated (-) (Chrome, IE, Safari)



    case 43:
      keystatus[68] = value;
      break; // + (Opera)

    case 45:
      keystatus[72] = value;
      break; // -

    case 42:
      keystatus[63] = value;
      break; // *

    case 47:
      keystatus[40] = value;
      break; // /



    case 107:
      keystatus[68] = value;
      break; // + (all browsers but Opera)

    case 109:
      keystatus[72] = value;
      break; // - 

    case 106:
      keystatus[63] = value;
      break; // *

    case 111:
      keystatus[40] = value;
      break; // /



    case 32:
      keystatus[32] = value;
      break; // spacebar

    case 8:
      keystatus[64] = value;
      break; // backspace

    case 220:
      keystatus[3] = value;
      break; // backslash, simulated LOCK (hand)

    case 192:
      keystatus[0] = value;
      break; // backquote, simulated 2nd

    case 38:
      keystatus[5] = value;
      break; // up

    case 40:
      keystatus[7] = value;
      break; // down

    case 37:
      keystatus[4] = value;
      break; // left

    case 39:
      keystatus[6] = value;
      break; // right

    case 190:
      keystatus[78] = value;
      break; // . (decimal point)

    case 13:
      keystatus[73] = value;
      break; // ENTER

    case 120:
      keystatus[52] = value;
      break; // F9 is treated as F1

    case 121:
      keystatus[2] = value;
      break; // F10 is treated as SHIFT

    case 48:
      keystatus[77] = value;
      break; // 0

    case 49:
      keystatus[13] = value;
      break; // 1

    case 50:
      keystatus[14] = value;
      break; // 2

    case 51:
      keystatus[15] = value;
      break; // 3

    case 52:
      keystatus[21] = value;
      break; // 4

    case 53:
      keystatus[22] = value;
      break; // 5

    case 54:
      keystatus[23] = value;
      break; // 6

    case 55:
      keystatus[29] = value;
      break; // 7

    case 56:
      keystatus[30] = value;
      break; // 8

    case 57:
      keystatus[31] = value;
      break; // 9

    case 65:
      keystatus[74] = value;
      break // A - Z

    case 66:
      keystatus[41] = value;
      break

    case 67:
      keystatus[25] = value;
      break

    case 68:
      keystatus[18] = value;
      break

    case 69:
      keystatus[19] = value;
      break

    case 70:
      keystatus[26] = value;
      break

    case 71:
      keystatus[34] = value;
      break

    case 72:
      keystatus[42] = value;
      break

    case 73:
      keystatus[59] = value;
      break

    case 74:
      keystatus[50] = value;
      break

    case 75:
      keystatus[58] = value;
      break

    case 76:
      keystatus[66] = value;
      break

    case 77:
      keystatus[57] = value;
      break

    case 78:
      keystatus[49] = value;
      break

    case 79:
      keystatus[67] = value;
      break

    case 80:
      keystatus[55] = value;
      break

    case 81:
      keystatus[75] = value;
      break

    case 82:
      keystatus[27] = value;
      break

    case 83:
      keystatus[10] = value;
      break

    case 84:
      keystatus[35] = value;
      break

    case 85:
      keystatus[51] = value;
      break

    case 86:
      keystatus[33] = value;
      break

    case 87:
      keystatus[11] = value;
      break

    case 88:
      keystatus[17] = value;
      break

    case 89:
      keystatus[43] = value;
      break

    case 90:
      keystatus[9] = value;
      break



  }



  return true; // suppress default action

}



function initialize_calculator()

{

  reset_calculator();



  reset(); // run code from v4sav to skip ahead

}



function reset_calculator()

{

  for (var b = 0; b < 131072; b++)

    ram[b] = 0;



  for (var p = 0; p < calcscreen.length; calcscreen[p++] = 0x50);



  // start here to skip the boot code (which is missing in TIB based images)



  for (var i = 0; i < 128; i++) ram[i] = rom[i + 0x12088 / 2];



  pc = 0x412188;

  sr = 0x2700;



  link_incoming_queue = new Array();

  link_outgoing_queue = new Array();

}



function fire_cpu_exception(e)

{

  if (stopped)

  {

    // these always resume

    if (e == 31 || e == 30) stopped = false;

    // these only resume if the right bit is set

    if (e >= 25 && e <= 29 && (wakemask & (1 << e - 25))) stopped = false;

  }

  if (stopped) return;



  // skip auto interrupt if current level too high

  if (e >= 25 && e <= 30)

  {

    var interrupt_level = e - 24;

    var current_level = (sr & 0x700) >> 8;

    if (current_level >= interrupt_level)

    {

      return;

    }

  }



  var oldsr = sr;

  update_sr(sr | 0x2000);



  if (e == 2 || e == 3) a7 -= 8; // for address error and bus error, reserve more stack space

  a7 -= 4; // push pc on supervisor stack

  write_memory(a7, 2, pc);

  a7 -= 2; // push sr on supervisor stack

  write_memory(a7, 1, oldsr);

  pc = rl(e * 4); // load new PC from vector table



  // set interrupt level for auto interrupt

  if (e >= 25 && e <= 31) {

    sr &= 0xF8FF;

    var new_level = (e - 24);

    sr += new_level * 256;

  }

}



var totalframes = 0;



function emu_main_loop()

{

  if (unhandled_count >= 10) return;



  var starttime = (new Date).getTime();

  var started = false;

  var prev_pc = 0;



  // The LCD refreshes every 8192 OSC2 cycles (by default)

  for (var outer = 0; outer < (256 - screen_height) * 2 && unhandled_count < 10; outer++)

  {

    if (!stopped)

    // Assume we can run 2 instructions per OSC2 cycle, so 64 instructions between programmable interrupt counts (every 32 cycles).

    // We get about 744khz OSC2 rate here, which comes out to around 1.49 million instructions per second, 

    // which is fairly reasonable depending on your instruction mix.

      for (var inner = 0; inner < 64; inner++) {

      // if (pc == 0x56ea6c) tracecount = 50; // end of a memory filling loop	

      // if (pc == 0x49BBAC) tracecount = 50; // end of a check	

      // if (pc == 0x49af08) tracecount = 50; // should have set 88fc to ffffffff but did not due to MOVEQ bug, now fixed

      //if (pc == 0x49bbca) tracecount = 50; // tst.l (A2) that had set condition codes incorrectly

      //if (pc == 0x49b680) tracecount = 50; // previous problem with ADD writing to wrong register

      //if (pc == 0x49bDa6) tracecount = 50; //  somewhere earlier, tracing source of wrong D0 value

      //if (pc == 0x49be00) tracecount = 50; // first use of indexing as destination ea

      //if (pc == 0x49af24) tracecount = 50; // first encounter of BLE at which point D0 had wrong value, later went wrong way

      //if (pc == 0x509a36) tracecount =100; // first ADDA

      //if (pc == 0x455102) tracecount = 50; // first MULS instruction (but shouldn't be run at all!)

      //if (pc == 0x421d84) tracecount = 50; // a BSR that once hit the wrong target

      //if (pc == 0x41225c) tracecount = 100; // should have written ff to 5cf1 (but only sometimes!)

      //if (pc == 0x422192) tracecount = 100; // first use of TRAP

      //if (pc == 0x49cacc) tracecount = 100; // first use of PEA

      //if (pc == 0x51a696) tracecount = 100; // call to st_busy

      //if (pc == 0x486c42) tracecount = 100; // first NEG instruction

      //if (pc == 0x4217e2) tracecount = 100; // first ROR instruction

      //if (pc == 0x4c906c) tracecount = 100; // first dynamic BIT operation

      //if (pc == 0x56e7f6) tracecount = 100; // first divu instruction

      //if (pc == 0x412b56) tracecount = 100; // various traps



      //if (pc == 0x56e7be) tracecount = 100; // a troublesome loop (entered wrong due to PC indexing error)		

      //if (pc == 0x56e7c4) tracecount = 100;

      //if (pc == 0x56eaec) tracecount = 100; // first CMPM

      //if (pc == 0x422f0a) tracecount = 50; // first cmp of a certain kind

      //if (pc == 0x4219d8) tracecount = 50; // first move SR, dest



      //if (pc == 0x49c0aa) tracecount = 3000; // near the end of the auto int 1 exception handler, failed to due predec MOVEM



      //if (pc == 0x415cae) tracecount = 1000; // something in this call ought to write 0x37bf6 at 0x840a



      //if (aregs[1] == 0xffffbb06 || aregs[1] < 0) tracecount = 200; to find the address register corruption (was ADDQ.W not properly treating as long)

      //if (pc == 0x416d7c) tracecount = 50;



      //if (pc == 0x9880) tracecount = 400; // phoenix side scrolling building

      //if (pc == 0xc124) tracecount = 200; // mercury grayscale setup



      //if (pc != Math.floor(pc)) console.log("non integer PC!");

      //if (pc < 0) console.log("underflow PC!");

      //if (pc >= 0x100000000) console.log("overflow PC!");



      //if ((pc == 0xabba) && ((dregs[2] & 0xFFFF) < 0x300)) tracecount = 200; // mercury map extraction



      //if (pc == 0xa85e) tracecount = 100; // phoenix collision check (was broken because MOVEQ not setting condition codes)



      //if (pc == 0xad5a) tracecount = 9; // phoenix enemy explosion countdown



      //if (pc == 0x13542) tracecount = 400; // monster about to verify level, failed due to overflow in A2 causing CMPA to not match

      //if (pc == 0x133d6) tracecount = 100; // first monster hit on actual brick

      //if (aregs[2] == 0x10000C568) tracecount = 20;



      //var digit = dregs[3] % 16;

      //if (digit < 0 || digit > 15 || digit != Math.floor(digit)) tracecount = 15;

      //if (pc == 0x420970) tracecount = 10; // registers corrupted here

      //if (pc == 0x24f16) tracecount = 200; // mercury CLIP TOP (bad subtraction result due to not masking)

      // if (aregs[1] == 0xffffffff && pc <= 0x40000) tracecount = 300; mercury had read corrupt data from heap

      //if (pc == 0x29e8a && aregs[0] == 0x163a) tracecount = 75; // mercury heap deletion



      //if (pc <= 0x2a016 && pc >= 0x29e44 && ram[0x163a] == 0xff) { tracecount = 300; console.log("we came from " + to_hex(prev_pc, 8)); } // detect memory corruption in Mercury 

      //if (pc == 0x29cbc) tracecount = 8; // player bullet handling, was somehow taking wild branch (bad bullet value at 2ee0)

      //if (pc == 0x29fae) tracecount = 100; // shortly before player bullet type is corrupted



      //if ((sr & 0x700) == 0x200) tracecount = 10;			

      //if (pc == 0x240ae) tracecount = 12; // platinum bad sprite height b&w (was wrong behavior of SUBI.W using whole register)



      //if ((sr & 0xff00) == 0x2200 && prev_pc >= 0x9800 && prev_pc < 0x9900) console.log(to_hex(prev_pc, 6) + " is where SR became " + to_hex(sr, 4));

      //if (pc == 0x98ae) tracecount = 10;

      //if (pc == 0x989c) tracecount = 4;

      //if ((pc >= 0x800000 || pc < 0x100) && prev_pc < 0x800000 && prev_pc >= 0x100)

      //	console.log("bad transfer old pc " + to_hex(prev_pc, 8) + " new pc " + to_hex(pc, 8));

      //if (pc == 0x41eb7c) tracecount = 500; // incorrect result of 20/25 (beacuse add.w cleared upper bits inappropriately)



      //if (pc == 0x416f54) tracecount = 5; // reading out of ragne data from memory



      //if (pc == 0x3963c) tracecount = 20; // TI-Chess A1 corruption, due to SUBQ underflow to address register

      //if (pc == 0x534ba) tracecount = 10; // krypton init

      //if (pc == 0x534bc) tracecount = 200; // krypton init

      //if (pc == 0x53538) tracecount = 300; // krypton init

      //if (pc == 0x5360c) tracecount = 10; // krypton init



      /*if (d0 < 0 || d0 >= 0x100000000) { console.log("D0 " + d0 + " prev_pc " + to_hex(prev_pc, 9)); d0 = 0; tracecount = 2; }

      if (d1 < 0 || d1 >= 0x100000000) { console.log("D1 " + d1 + " prev_pc " + to_hex(prev_pc, 9)); d1 = 0; tracecount = 2; }

      if (d2 < 0 || d2 >= 0x100000000) { console.log("D2 " + d2 + " prev_pc " + to_hex(prev_pc, 9)); d2 = 0; tracecount = 2; }

      if (d3 < 0 || d3 >= 0x100000000) { console.log("D3 " + d3 + " prev_pc " + to_hex(prev_pc, 9)); d3 = 0; tracecount = 2; }

      if (a0 < 0 || a0 >= 0x100000000) { console.log("a0 " + a0 + " prev_pc " + to_hex(prev_pc, 9)); a0 = 0; tracecount = 2; }

      if (a1 < 0 || a1 >= 0x100000000) { console.log("a1 " + a1 + " prev_pc " + to_hex(prev_pc, 9)); a1 = 0; tracecount = 2; }

      if (a2 < 0 || a2 >= 0x100000000) { console.log("a2 " + a2 + " prev_pc " + to_hex(prev_pc, 9)); a2 = 0; tracecount = 2; }

      if (a3 < 0 || a3 >= 0x100000000) { console.log("a3 " + a3 + " prev_pc " + to_hex(prev_pc, 9)); a3 = 0; tracecount = 2; }

      if (d4 < 0 || d4 >= 0x100000000) { console.log("D4 " + d4 + " prev_pc " + to_hex(prev_pc, 9)); d4 = 0; tracecount = 2; }

      if (d5 < 0 || d5 >= 0x100000000) { console.log("D5 " + d5 + " prev_pc " + to_hex(prev_pc, 9)); d5 = 0; tracecount = 2; }

      if (d6 < 0 || d6 >= 0x100000000) { console.log("D6 " + d6 + " prev_pc " + to_hex(prev_pc, 9)); d6 = 0; tracecount = 2; }

      if (d7 < 0 || d7 >= 0x100000000) { console.log("D7 " + d7 + " prev_pc " + to_hex(prev_pc, 9)); d7 = 0; tracecount = 2; }

      if (a4 < 0 || a4 >= 0x100000000) { console.log("a4 " + a4 + " prev_pc " + to_hex(prev_pc, 9)); a4 = 0; tracecount = 2; }

      if (a5 < 0 || a5 >= 0x100000000) { console.log("a5 " + a5 + " prev_pc " + to_hex(prev_pc, 9)); a5 = 0; tracecount = 2; }

      if (a6 < 0 || a6 >= 0x100000000) { console.log("a6 " + a6 + " prev_pc " + to_hex(prev_pc, 9)); a6 = 0; tracecount = 2; }

      if (a7 < 0 || a7 >= 0x100000000) { console.log("a7 " + a7 + " prev_pc " + to_hex(prev_pc, 9)); a7 = 0; tracecount = 2; }

      if (pc < 0 || pc >= 0x100000000) { console.log("pc " + pc + " prev_pc " + to_hex(prev_pc, 9)); pc = 0; tracecount = 2; }*/



      // if (pc == 0x415cdc) tracecount = 25; // memory corruption after link

      //if (pc == 0x413f4a) tracecount = 25; // silent link failure

      //if (pc == 0x413e5e) tracecount = 25; // silent link failure, at TranslatePack

      //if (pc == 0x413c7a) tracecount = 5; // monitoring packet length pedrom 0.72

      //if (pc == 0x41f9dc) tracecount = 520; // _tt_Decompress



      //if (pc == 0x41fb46) console.log("storing D0=" + to_hex(d0 & 255, 4) +" to " + to_hex(a4,9))

      //if (pc == 0x41fbe0) console.log("storing D4=" + to_hex(d4 & 255, 4) +" to " + to_hex(a4,9))

      //if (pc == 0x41fabe) console.log("storing D3=" + to_hex(d3 & 255, 4) +" to " + to_hex(a2,9))

      //if (pc == 0x41fbae) console.log("storing D5=" + to_hex(d5 & 255, 4) +" to " + to_hex(a2,9))





      //if (pc == 0x4122e8) tracecount = 30; // pedrom hw version detection



      try {

        var opcode = rw(pc);

        /*if (tracecount > 0) {

        	tracecount--;

        	if (overall > 0) {

        		overall--;

        		print_status();

        	}

        }

        if (pc < 0x40000)

        {

        	if (ramflag[pc / 2] != 567)

        	{

        		ramflag[pc / 2] = 567;

        		console.log("First execution at this point, previous = " + to_hex(prev_pc, 9));

        		print_status();						

        	}

        }

        prev_pc = pc;*/

        pc += 2;



        t[opcode]();

      } catch (e) {

        if (e == "STOP")

        {

          stopped = true;

          //console.log("stopped at " + to_hex(pc,9) + " SR = " + to_hex(sr,5));

          break;

        } else if (isNaN(e) || e < 0 || e > 255 || e != Math.floor(e))

        {

          // this is a real javascript exception

          console.log("real javascript exception " + e);

          console.log(e.stack);

          clearInterval(interval);

          return;

        } else

        {

          // this is a processor exception

          if (e < 25) console.log("processor exception " + to_hex(e, 2) + " occured at PC=" + to_hex(pc, 8));

          if (e == 10 || e == 11) pc -= 2;

          fire_cpu_exception(e);

        }

      }



      //if ((pc < 0x1000) && (prev_pc >= 0x1000)) console.log("we jumped into a low PC " + to_hex(pc,8) + " from " + to_hex(prev_pc, 8));

    }



    // check if osc2 enabled

    if (interrupt_control & 2)

    {

      osc2_counter += 32;



      if (osc2_counter >= 0x1000000) osc2_counter -= 0x1000000;



      // check master interrupt control

      if ((interrupt_control & 0x80) == 0)

      {

        // Trigger level 1 interrupt

        if ((osc2_counter & 0x7FF) == 0)

          fire_cpu_exception(25);



        // Trigger level 3 interrupt

        if ((osc2_counter & 0x7FFFF) == 0 && (interrupt_control & 4))

          fire_cpu_exception(27);



        // Programmable timer

        if (((osc2_counter % interrupt_rate) == 0) && (interrupt_control & 8))

        {

          if (timer_current == 0)

            timer_current = timer_min;

          else

            timer_current++;

          if (timer_current >= 256)

          {

            timer_current = 0;

            fire_cpu_exception(29);

          }

        }

      }

    }



    // link interrupts

    if (((link_config & 5) && link_incoming_queue.length > 0 && typeof(link_incoming_queue[0]) == "number") ||

      (link_config & 6))

    {

      fire_cpu_exception(28);

    }



    if (link_incoming_queue.length > 0)

    {

      if (link_incoming_queue[0] == 'WAIT_OK')

      {

        for (var x = 0; x + 4 <= link_outgoing_queue.length; x++)

        {

          if (link_outgoing_queue[x] == 0x88 && link_outgoing_queue[x + 1] == 0x56 && link_outgoing_queue[x + 2] == 0 && link_outgoing_queue[x + 3] == 0)

          {

            link_outgoing_queue = link_outgoing_queue.splice(0, x + 4);

            link_incoming_queue.shift();

            console.log("finished waiting for OK");

          }

        }

      } else if (link_incoming_queue[0] == 'WAIT_CTS')

      {

        for (var x = 0; x + 4 <= link_outgoing_queue.length; x++)

        {

          if (link_outgoing_queue[x] == 0x88 && link_outgoing_queue[x + 1] == 9 && link_outgoing_queue[x + 2] == 0 && link_outgoing_queue[x + 3] == 0)

          {

            link_outgoing_queue = link_outgoing_queue.splice(0, x + 4);

            link_incoming_queue.shift();

            console.log("finished waiting for CTS");

          }

        }

      }

    }

  }



  draw_screen();



  var endtime = (new Date).getTime();



  total_time += (endtime - starttime);

  frames_counted++;



  if (frames_counted == 1000)

  {

    document.title = "Average milliseconds for the last 1000 frames is " + (total_time / 1000);

    total_time = frames_counted = 0;

  }



  if (newromready)

  {

    var inputrom = newromready.result;

    newromready = false;

    var buf = new Uint8Array(inputrom);

    if (inputrom.byteLength == 0x200000)

    {

      console.log("Processing plain ROM image");

      rom = new Array();

      for (var x = 0; x < 0x200000; x += 2)

      {

        rom.push(buf[x] * 256 + buf[x + 1]);

      }

      reset_calculator();

    } else

    {

      console.log("Processing TIB/9XU image");

      rom = new Array();

      for (var y = 0; y < 0x12000; y += 2) {
        rom.push(0x1400);
      }



      var start = 0;

      if (buf[0] == 0x2a && buf[4] == 0x46)

      {

        for (var test = 0; test < inputrom.byteLength - 8; test++)

        {

          if (buf[test] == 0x62 && buf[test + 1] == 0x61 && buf[test + 2] == 0x73 && buf[test + 3] == 0x65 && buf[test + 4] == 0x63 && buf[test + 5] == 0x6f && buf[test + 6] == 0x64 && buf[test + 7] == 0x65)

          {

            start = test + 0x3d;

            break;

          }

        }

      }

      console.log("Offset = " + start);



      for (var x = start; x < inputrom.byteLength; x += 2)

      {

        rom.push(buf[x] * 256 + buf[x + 1]);

      }

      while (rom.length < 0x100000) rom.push(0xFFFF);

      reset_calculator();

      overall = 150;
      tracecount = 50;

    }

  }



  if (newfileready)

  {

    var inputfile = newfileready.result

    newfileready = false;

    var buf = new Uint8Array(inputfile);



    link_incoming_queue.push(8, 6); // standard variable header



    var varname = new Array();

    varname.push(0x6d, 0x61, 0x69, 0x6e, 0x5c); // "main/"

    for (var x = 0x40; x < 0x48; x++)

    {

      if (buf[x] == 0) break;

      varname.push(buf[x]);

    }

    var header_len = varname.length + 6;

    var data_len = buf[0x57] + buf[0x56] * 256; // data length is big endian in file

    var data_len_full = data_len + 2;



    link_incoming_queue.push(header_len, 0); // header length, little endian to calc

    link_incoming_queue.push(data_len_full % 256, data_len_full >>> 8, 0, 0); // data length, little endian to calc	

    link_incoming_queue.push(buf[0x48]); // variable type

    link_incoming_queue.push(varname.length);



    var header_checksum = varname.length + buf[0x48] + (data_len_full >>> 8) + (data_len_full % 256);

    for (var x = 0; x < varname.length; x++)

    {

      link_incoming_queue.push(varname[x]);

      header_checksum += varname[x];

    }



    link_incoming_queue.push(header_checksum % 256, header_checksum >>> 8); // header checksum, little endian to calc



    link_incoming_queue.push('WAIT_OK', 'WAIT_CTS', 8, 0x56, 0, 0); // ACK packet (for calc's CTS)



    var data_section_len = data_len + 6;

    link_incoming_queue.push(8, 0x15);

    link_incoming_queue.push(data_section_len % 256, data_section_len >>> 8); // length, little endian to calc

    link_incoming_queue.push(0, 0, 0, 0);

    link_incoming_queue.push(data_len >>> 8, data_len % 256); // length, this time big endian



    var data_checksum = (data_len % 256) + (data_len >>> 8);

    for (var x = 0x58; x < 0x58 + data_len; x++)

    {

      link_incoming_queue.push(buf[x]);

      data_checksum += buf[x];

    }

    link_incoming_queue.push(data_checksum % 256, (data_checksum >>> 8) % 256); // data checksum, little endian to calc



    link_incoming_queue.push('WAIT_OK', 8, 0x92, 0, 0, 'WAIT_OK');



    console.log("finished processing variable");

  }

}



function loadrom()

{

  var infile = document.getElementById("romfile").files[0];

  console.log("starting to read file " + infile.name);

  var extension = infile.name.toLowerCase().substr(-4)

  if (infile.size == 0x200000 && extension == ".rom")

  {

    console.log("Loading as plain ROM");

    var reader = new FileReader();

    reader.onload = function() {
      newromready = reader;
      unhandled_count = 0;
    };

    reader.readAsArrayBuffer(infile);

  }

  if (infile.size >= 1024 && infile.size < 0x200000 && (extension == ".tib" || extension == ".9xu"))

  {

    console.log("Starting to load as TIB / 9XU");

    var reader = new FileReader();

    reader.onload = function() {
      newromready = reader;
      unhandled_count = 0;
    };

    reader.readAsArrayBuffer(infile);

  }

  if (infile.size >= 80 && infile.size < 70000 && ".9xz.9xy.9xs.89z.89y.89s.9xp.89p".indexOf(extension) != -1)

  {

    console.log("Starting to load as variable");

    var reader = new FileReader();

    reader.onload = function() {
      newfileready = reader;
      unhandled_count = 0;
    };

    reader.readAsArrayBuffer(infile);

  }

}
