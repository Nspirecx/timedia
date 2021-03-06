function newTh(place) {
  var newTh = document.createElement('th');
  place.appendChild(newTh);
  newTh.innerHTML = 'Value';
}

function newRow() {
  var newTr = document.createElement('tr');
  document.getElementsByTagName('table')[0].appendChild(newTr);
  for (var i = 0; i < document.getElementsByTagName('table')[0].getElementsByTagName('tr')[0].getElementsByTagName('th').length; i++) {
    newTh(newTr);
  }
}

function newColumn() {
  for (var i = 0; i < document.getElementsByTagName('table')[0].getElementsByTagName('tr').length; i++) {
    newTh(document.getElementsByTagName('tr')[i]);
  }
}

function getCellData(column, row) {
  return document.getElementsByTagName('table')[0].getElementsByTagName('tr')[row].getElementsByTagName('th')[column].innerHTML;
}

function getColumnMean(column) {
  var sum = 0;
  for (var i = 0; i < document.getElementsByTagName('table')[0].getElementsByTagName('tr').length; i++) {
    sum = eval(document.getElementsByTagName('table')[0].getElementsByTagName('tr')[i].getElementsByTagName('th')[column].innerHTML + "+" + sum.toString());
  }
  return sum / document.getElementsByTagName('table')[0].getElementsByTagName('tr').length;
}

function getColumnRange(column) {
  var highest = document.getElementsByTagName('table')[0].getElementsByTagName('tr')[0].getElementsByTagName('th')[column].innerHTML;
  var lowest = document.getElementsByTagName('table')[0].getElementsByTagName('tr')[0].getElementsByTagName('th')[column].innerHTML;
  for (var i = 0; i < document.getElementsByTagName('table')[0].getElementsByTagName('tr').length; i++) {
    eval('if(' + document.getElementsByTagName('table')[0].getElementsByTagName('tr')[i].getElementsByTagName('th')[column].innerHTML + ' > ' + highest + ') {highest = ' + document.getElementsByTagName('table')[0].getElementsByTagName('tr')[i].getElementsByTagName('th')[column].innerHTML + ';}');
    eval('if(' + document.getElementsByTagName('table')[0].getElementsByTagName('tr')[i].getElementsByTagName('th')[column].innerHTML + ' < ' + lowest + ') {lowest = ' + document.getElementsByTagName('table')[0].getElementsByTagName('tr')[i].getElementsByTagName('th')[column].innerHTML + ';}');
  }
  return (highest - lowest);
}

function pickRandomFromColumn(column) {
  return document.getElementsByTagName('table')[0].getElementsByTagName('tr')[Math.floor(Math.random() * document.getElementsByTagName('table')[0].getElementsByTagName('tr').length)].getElementsByTagName('th')[column].innerHTML
}

function saveSheet() {
  if (localStorage.tisheetssave == undefined) {
    var tisheetssave = generateRandString()
    storeInDatabase(tisheetssave, CryptoJS.AES.encrypt(document.getElementById("sheetsContent").innerHTML, localStorage.password) + "")
    localStorage.tisheetssave = tisheetssave;
    var urlRef = window.dbRef.child(tisheetssave);
    urlRef.on("value", function (snapshot) {
      snapshot.forEach(function (child) {
        localStorage.owner = child.key;
      });
    });
    var url = "index.html?app=4" + "&t=" + localStorage.tisheetssave;
    localStorage.workToSave = url;
    localStorage.workToSaveTitle = document.getElementById('sheetsTitle').value;
    localStorage.recentUrl = url;
  } else {
    window.dbRef.child(localStorage.tisheetssave).child(localStorage.owner).set(CryptoJS.AES.encrypt(document.getElementById("sheetsContent").innerHTML, localStorage.password) + "");
    var tisheetssave = localStorage.tisheetssave
  }
}

var tisheetsContent = document.getElementById('sheetsContent')

if ("addEventListener" in tisheetsContent) {
  tisheetsContent.addEventListener("keyup", saveSheet, false);
  if (localStorage.autosaved == undefined || localStorage.editAutoSave !== undefined) {
    localStorage.autosaved = true;
    if (localStorage.editAutoSave !== undefined) {
      localStorage.removeItem('editAutoSave');
    }
  }
}

if (getQueryVariable("t") !== false || localStorage.editSheet !== undefined) {
  if (localStorage.editSheet !== undefined) {
    document.getElementById('sheetsTitle').remove();
  }
  if (getQueryVariable("t") == false) {
    document.getElementById("sheetsContent").innerHTML = localStorage.editSheet;
    localStorage.editAutoSave = localStorage.editSheet;
    localStorage.removeItem("editSheet");
  } else {
    document.getElementById('sheetsTitle').style = "display: none;";
    document.getElementById('sheets-formatting-bar').style = "display: none;";
    var urlRef = window.dbRef.child(getQueryVariable("t"));
    urlRef.on("value", function (snapshot) {
      snapshot.forEach(function (child) {
        localStorage.owner = child.key;
        if (localStorage.owner.toLowerCase() !== localStorage.name.toLowerCase()) {
          window.location.href = 'index.html?app=7';
          alert("Access Denied! Get TIed!")
        }
        document.getElementById("sheetsContent").innerHTML = CryptoJS.AES.decrypt(child.val(), localStorage.password).toString(CryptoJS.enc.Utf8);
        window.edit =document.getElementById("sheetsContent").innerHTML
      });
    });
    document.getElementById("sheetsContent").setAttribute("contenteditable", false);
    document.getElementById('tisheets-add-row').style = "display: none;";
    document.getElementById('tisheets-add-column').style = "display: none;";
    document.getElementById('tisheets-edit').style.display = ''
    document.getElementById('tisheets-reader').style.display = "";
  }
}

function editSheet() {
  localStorage.editSheet = window.edit
  window.location.href = "index.html?app=4";
  document.getElementById('sheetsTitle').style = "";
  localStorage.tisheetssave = getQueryVariable("t")
}

function sheetReader() {
  document.getElementById('timedia-nav-bar').remove();
  document.getElementById('tisheets-edit').remove();
  document.getElementById('tisheets-reader').remove();
  document.getElementById('tisheets-header').remove();
}

window.addEventListener('DOMContentLoaded', function () {
  if (localStorage.editAutoSave == undefined && localStorage.tisheetssave !== undefined) {
    localStorage.removeItem('tisheetssave');
  }
}, false);
