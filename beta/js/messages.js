if (getQueryVariable("app") == 2) {
  document.getElementById("chat").style = "";
  document.getElementById("joinChatBtn").style = "";

}

var sortAlphabets = function(text) {
    return text.split('').sort().join('');
};


function joinChat() {
var chat = document.getElementById('chat').value + localStorage.name;
localStorage.chatTitle = document.getElementById("chat").value + "  Chat";
var chatPassword1 = sortAlphabets(chat);
var chatPassword = MD5(chatPassword1);
window.location.href = "index.html?app=" + chatPassword;

}

if (window.location !== "index.html" && getQueryVariable("app") !== false) {
  setInterval(changeName, 50);
  document.title = localStorage.chatTitle
} else {
}
