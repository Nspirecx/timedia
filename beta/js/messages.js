var sortAlphabets = function(text) {
  return text.split('').sort().join('');
};

function joinChat() {
  var chat = document.getElementById('chat').value + localStorage.name;
  var chat = chat.toLowerCase();
  var chatPassword1 = sortAlphabets(chat);
  var chatPassword = MD5(chatPassword1);
  window.location.href = "index.html?app=" + chatPassword;
}

if (window.location !== "index.html" && getQueryVariable("app") !== false && getQueryVariable("app").length > 7) {
  setInterval(changeName, 50);
  document.title = "TiChat - TiMedia"
  getMessages()
}

function getMessages() {
   var urlRef = window.dbRef.child(getQueryVariable("app"));
   urlRef.on("value", function (snapshot) {
    snapshot.forEach(function (child) {
      document.getElementById('private-messages').innerHTML += '<br><br><p>' + CryptoJS.AES.decrypt(child.val(), localStorage.password).toString(CryptoJS.enc.Utf8); + '</p>';
    });
  });
}

function sendMessage(message) {
  var length = window.dbRef.child(getQueryVariable("app")).length;
  if (length !== undefined) {
  window.dbRef.child(getQueryVariable("app")).child(length + 1).set(CryptoJS.AES.encrypt("<b>" + localStorage.name + "</b>" + " said:" + "<br>" + message, localStorage.password) + "");
  } else {
      window.dbRef.child(getQueryVariable("app")).child(0).set(CryptoJS.AES.encrypt("<b>" + localStorage.name + "</b>" + " said:" + "<br>" + message, localStorage.password) + "");
  }
}
