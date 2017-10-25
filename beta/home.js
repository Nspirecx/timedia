var mutedusers = ["henry"];

function getQueryVariable(variable)
{
       var query = window.location.search.substring(1);
       var vars = query.split("&");
       for (var i=0;i<vars.length;i++) {
               var pair = vars[i].split("=");
               if(pair[0] == variable){return pair[1];}
       }
       return(false);
}

function launchApp(appname) {
  document.getElementById('home').remove();

  document.getElementById(appname).style = "visibility: block;"
}

if (localStorage.access !== undefined) {
  if (getQueryVariable("app") == 1) {
    launchApp("points");
    document.title = "Points - TiMedia";
  }

  if (getQueryVariable("app") == 2) {
    launchApp("messages");
    document.title = "Messages - TiMedia";
  }

  if (getQueryVariable("app") == 3) {
    launchApp("tidocs");
    document.title = "TiDocs - TiMedia";
  }
       
  if (getQueryVariable("app") == 4) {
    launchApp("tisheets");
    document.title = "TiSheets - TiMedia";
  }
       
  /*if (getQueryVariable("app") == 5) {
    launchApp("ticontacts");
    document.title = "TiContacts - TiMedia";
  }*/
       
  if (getQueryVariable("app") == 6) {
    launchApp("settings");
    document.title = "Settings - TiMedia";
  }
       
  if (getQueryVariable("app") == 7) {
    launchApp("tiles");
    document.title = "Tiles - TiMedia";
  }
       
  if (getQueryVariable("app") == 8) {
    launchApp("newapp");
    document.title = "New App - TiMedia";
  }
} else {
  window.location.href = "login.html";
}

function checkMute() {
if (contains(mutedusers, localStorage.name)) {
  document.getElementById('HCB_comment_form_box').remove();
  document.getElementById('mutemessage').innerHTML = "You are muted! You cannot post comments.";
 }
}
