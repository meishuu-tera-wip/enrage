const Slash = require('slash');

const NPCS = {
  970: { // RM HM
    1000: { name: 'Atrocitas', amount: 0.1, time: 36 },
    2000: { name: 'Malgarios', amount: 0.1, time: 36 },
    3000: { name: 'Lachelith', amount: 0.1, time: 36 },
  },
};

const INFURIATES = {
  0: 35, // warrior
  1: 12, // lancer
  10: 14, // brawler
};

function pad(n) {
  return ('00' + n).slice(-2);
}

function percentage(n) {
  return Math.round(n * 100) + '%';
}

function timefmt(time) {
  const t = Math.round(time / 1000);
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${pad(s)}`;
};

module.exports = function enrage(dispatch) {
  let npcs = {};
  let party = {};
  let enabled = true;

  const slash = new Slash(dispatch);

  slash.on('enr', (args) => {
    switch (args[1].toLowerCase()) {
      case 'on': {
        enabled = true;
        slash.print('[Enrage] Enabled.');
        break;
      }

      default: {
        enabled = false;
        slash.print('[Enrage] Disabled.');
        break;
      }
    }
  });

  function $say(msg) {
    if (enabled) {
      dispatch.toServer('cChat', { channel: 21, message: msg });
    }
  }

  setInterval(() => {
    var dt, id, npc;
    for (id in npcs) {
      npc = npcs[id];
      if (npc.enrage && npc.announce) {
        dt = (npc.time + npc.enrTime * 1000) - Date.now();
        if (dt / 1000 <= 10) {
          npc.announce = false;
          $say('** 10s til unenrage **');
        }
      }
    }
  }, 500);

  dispatch.hook('sPartyMemberList', function(event) {
    var i, len, member, ref;
    party = {};
    ref = event.members;
    for (i = 0, len = ref.length; i < len; i++) {
      member = ref[i];
      party[member.cID.high + '.' + member.cID.low] = member.name;
    }
  });

  dispatch.hook('sBossGageInfo', function(event) {
    var id, npc, ref;
    id = event.id.high + '.' + event.id.low;
    npc = (ref = NPCS[event.type]) != null ? ref[event.npc] : void 0;
    if (npc != null) {
      if (npcs[id] == null) {
        npcs[id] = {
          enrAmt: npc.amount,
          enrTime: npc.time,
          name: npc.name,
          lastHp: event.curHp,
          curHp: event.curHp,
          maxHp: event.maxHp,
          time: Date.now(),
          lastTime: Date.now(),
          enrage: false,
          announce: true,
          engage: false,
          uptime: 0
        };
      } else {
        npcs[id].curHp = event.curHp;
      }
      if (!npcs[id].engage && event.curHp < event.maxHp) {
        npcs[id].engage = Date.now();
      }
    }
  });

  dispatch.hook('sNpcStatus', function(event) {
    var enrage, id, nextHp, npc, pct, txt;
    id = event.creature.high + '.' + event.creature.low;
    npc = npcs[id];
    if (npc != null) {
      enrage = !!event.enraged;
      if (enrage !== npc.enrage) {
        npc.enrage = enrage;
        if (enrage) {
          npc.lastTime = Date.now();
          npc.time = Date.now();
          npc.announce = true;
          $say('Enraged - ' + npc.enrTime + 's');
        } else {
          npc.uptime += Date.now() - npc.lastTime;
          npc.lastHp = npc.curHp;
          txt = 'Unenraged';
          if (npc.enrAmt) {
            pct = Math.floor((npc.curHp / npc.maxHp - npc.enrAmt) * 100 );
            if (pct < 0) {
              txt += ' - Need infuriate';
            } else {
              txt += ' - Next @ ' + pct + '%';
            }
          }
          $say(txt);
        }
      }
    }
  });

  dispatch.hook('sEachSkillResult', function(event) {
    var id, infuriate, job, npc, ref, skill, source;
    id = event.target.high + '.' + event.target.low;
    npc = npcs[id];
    if (npc != null) {
      infuriate = false;
      if ((10101 <= (ref = event.model) && ref <= 11112)) {
        job = (event.model - 10101) % 100;
        skill = Math.floor((event.skill - 0x4000000) / 10000);
        infuriate = INFURIATES[job] === skill;
      }
      if (infuriate) {
        npc.time = Date.now();
        npc.announce = true;
        source = event.source.high + '.' + event.source.low;
        if (party[source] != null) {
          $say(party[source] + ' infuriated - ' + npc.enrTime + 's');
        } else {
          $say('Infuriated - ' + npc.enrTime + 's');
        }
      }
    }
  });

  dispatch.hook('sDespawnNpc', function(event) {
    var duration, id, npc;
    id = event.target.high + '.' + event.target.low;
    npc = npcs[id];
    if ((npc != null) && npc.engage) {
      if (npc.enrage) {
        npc.uptime += Date.now() - npc.lastTime;
      }
      duration = Date.now() - npc.engage;
      if (duration > 30) {
        $say(npc.name + " enrage uptime: " + (timefmt(npc.uptime)) + " / " + (timefmt(duration)) + " (" + (percentage(npc.uptime / duration)) + ")");
      }
      delete npcs[id];
    }
  });
};
