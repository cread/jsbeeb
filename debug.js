function Debugger() {
    var self = this;
    var disass = $('#disassembly');
    var debugNode = $('#debug, #hardware_debug');
    var cpu = null;
    var disassemble = null;
    var enabled = false;

    function enable(e) {
        enabled = e;
        debugNode.toggle(enabled);
    }
    this.enabled = function() { return enabled; };

    enable(false);

    var numToShow = 32;
    for (var i = 0; i < numToShow; i++) {
        disass.find('.template').clone().removeClass('template').appendTo(disass);
    }

    var uservia;
    var sysvia;
    function setupVia(node, via) {
        var updates = [];
        $.each(["ora", "orb", "ira", "irb", "ddra", "ddrb", 
                "acr", "pcr", "ifr", "ier", "t1c", "t1l", "t2c", "t2l"], function(_, elem) {
            var row = node.find(".template").clone().removeClass("template").appendTo(node);
            row.find(".register").text(elem.toUpperCase());
            var value = row.find(".value");
            if (elem.match(/t[12][cl]/)) {
                updates.push(function() {
                    var reg = via[elem];
                    value.text(hexbyte((reg>>16) & 0xff) + 
                        hexbyte((reg>>8) & 0xff) + hexbyte(reg & 0xff));
                });
            } else {
                updates.push(function() {
                    value.text(hexbyte(via[elem]));
                });
            }
        });
        var update = function() {
            $.each(updates, function(_, up) { up(); });
        };
        update();
        return update;
    }

    this.setCpu = function(c) { 
        cpu = c; 
        disassemble = c.disassembler.disassemble;
        sysvia = setupVia($('#sysvia'), c.sysvia);
        uservia = setupVia($('#uservia'), c.uservia);
    };

    var disassPc = null;
    this.debug = function(where) {
        enable(true);
        for (var i = 0; i < numToShow / 2; ++i)
            where = prevInstruction(where);
        updateDisassembly(where);
        updateRegisters();
        sysvia();
        uservia();
    };

    this.hide = function() { enable(false); };

    function updateRegisters() {
        $("#cpu6502_a").text(hexbyte(cpu.a));
        $("#cpu6502_x").text(hexbyte(cpu.x));
        $("#cpu6502_y").text(hexbyte(cpu.y));
        $("#cpu6502_s").text(hexbyte(cpu.s));
        $("#cpu6502_pc").text(hexword(cpu.pc));
        ["c", "z", "i", "d", "v", "n"].forEach(function(flag) {
            $("#cpu6502_flag_" + flag).text(cpu.p[flag] ? flag.toUpperCase() : flag);
        });
    }

    function stepUntil(f) {
        cpu.cycles = 0; // TODO: this prevents the cpu from running any residual cycles. look into a better solution
        for (var i = 0; i < 65536; i++) {
            cpu.execute(1);
            if (f()) break;
        }
        self.debug(cpu.pc);
    }

    function step() {
        var curpc = cpu.pc;
        stepUntil(function () { return cpu.pc != curpc; });
    }

    this.step = step;

    function isUnconditionalJump(addr) {
        var result = disassemble(addr);
        if (result[0].match(/^(JMP|RTS)/)) {
            return true;
        }
        return false;
    }

    function stepOver() {
        if (isUnconditionalJump(cpu.pc)) {
            return step();
        }
        var nextPc = nextInstruction(cpu.pc);
        stepUntil(function () { return cpu.pc == nextPc; });
    }

    function isReturn(addr) {
        var result = disassemble(addr);
        if (result[0] == "RTS")
            return true;
        return false;
    }

    function stepOut() {
        var sp = cpu.sp;
        stepUntil(function () {
            if (cpu.sp >= sp && isReturn(cpu.pc)) {
                var nextInstr = nextInstruction(cpu.pc);
                step();
                return cpu.pc != nextInstr;
            }
            return false;
        });
    }

    function prevInstruction(address) {
        for (var startingPoint = address - 20; startingPoint != address; startingPoint++) {
            var addr = startingPoint & 0xffff;
            while (addr < address) {
                var result = disassemble(addr);
                if (result[1] == address && result[0] != "???") {
                    return addr;
                }
                addr = result[1];
            }
        }
        return address - 1;
    }

    function nextInstruction(address) {
        return disassemble(address)[1] & 0xffff;
    }

    function addressName() { return null; /* later, more clevers */ }
    function labelHtml(addr) {
        var name = addressName(addr);
        if (name) {
            return name + ':';
        } else {
            return '<span class="addr">' + hexword(addr) + '</span>';
        }
    }

    function updateDisassembly(address) {
        disassPc = address;
        disass.children().each(function() {
            var result = disassemble(address);
            var hex = "";
            var asc = "";
            for (var i = address; i < result[1]; ++i) {
                if (hex !== "") hex += " ";
                var b = cpu.readmem(i);
                hex += hexbyte(b);
                if (b >= 32 && b < 128) {
                    asc += String.fromCharCode(b);
                } else { 
                    asc += "."; 
                }
            }
            $(this).find('.dis_addr').html(labelHtml(address));
            $(this).toggleClass('current', address == cpu.pc);
            $(this).find('.instr_bytes').text(hex);
            $(this).find('.instr_asc').text(asc);
            $(this).find('.disassembly').html(result[0]);
            $(this).find('.addr')
            //.editable({editBy: 'dblclick', editClass: 'editable', onSubmit:endLabelEdit })
            .keypress(function(e) { if (e.which==13) $(this).blur(); });
            address = result[1];
        });
    }

    this.keyPress = function(key) {
        switch (String.fromCharCode(key)) {
        case 'k':
            updateDisassembly(prevInstruction(disassPc));
            break;
        case 'j':
            updateDisassembly(nextInstruction(disassPc));
            break;
        case 'n':
            step();
            break;
        case 'm':
            stepOver();
            break;
        case 'u':
            stepOut();
            break;
        }
        return true;
    };
}
