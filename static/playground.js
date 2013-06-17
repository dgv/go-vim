// Copyright 2012 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

(function() {
"use strict";

  
  function highlightErrors(text) {
	if (!code || !text) {
		return;
	}
	var errorRe = /[a-z0-9]+\.go:([0-9]+):/g;
	var result;
	while ((result = errorRe.exec(text)) !== null) {
		var line = result[1]*1-1;
		code.addLineClass(line, null, 'errLine');
	}
	code.on('change', function() {		
		for (var i = 0; i < code.lineCount(); i++) {
			code.removeLineClass(i, null, 'errLine');
		}
	});
  } 
  function connectPlayground() {
    var playbackTimeout;

    function playback(pre, events) {
      function show(msg) {
        // ^L clears the screen.
        var msgs = msg.split("\x0c");
        if (msgs.length == 1) {
          pre.text(pre.text() + msg);
          return;
        }
        pre.text(msgs.pop());
      }
      function next() {
        if (events.length === 0) {
          var exit = $('<span class="exit"/>');
          exit.text("\nProgram exited.");
          exit.appendTo(pre);
          return;
        }
        var e = events.shift();
        if (e.Delay === 0) {
          show(e.Message);
          next();
        } else {
          playbackTimeout = setTimeout(function() {
            show(e.Message);
            next();
          }, e.Delay / 1000000);
        }
      }
      next();
    }

    function stopPlayback() {
      clearTimeout(playbackTimeout);
    }

    function setOutput(output, events, error) {
      stopPlayback();
      output.empty();
  
      // Display errors.
      if (error) {
        highlightErrors(error);
	output.addClass("error").text(error);
        return;
      }
  
      // Display image output.
      if (events.length > 0 && events[0].Message.indexOf("IMAGE:") === 0) {
        var out = "";
        for (var i = 0; i < events.length; i++) {
          out += events[i].Message;
        }
        var url = "data:image/png;base64," + out.substr(6);
        $("<img/>").attr("src", url).appendTo(output);
        return;
      }
  
      // Play back events.
      if (events !== null) {
        playback(output, events);
      }
    }

    var seq = 0;
    function runFunc(body, output) {
      output = $(output);
      seq++;
      var cur = seq;
      var data = {
        "version": 2,
        "body": body
      };
      $.ajax("/compile", {
        data: data,
        type: "POST",
        dataType: "json",
        success: function(data) {
          if (seq != cur) {
            return;
          }
          if (!data) {
            return;
          }
          if (data.Errors) {
            setOutput(output, null, data.Errors);
            return;
          }
          setOutput(output, data.Events, false);
        },
        error: function() {
          output.addClass("error").text(
            "Error communicating with remote server."
          );
        }
      });
      return stopPlayback;
    }

    return runFunc;
  }

  // opts is an object with these keys
  //  codeEl - code editor element
  //  outputEl - program output element
  //  runEl - run button element
  //  fmtEl - fmt button element (optional)
  //  shareEl - share button element (optional)
  //  shareURLEl - share URL text input element (optional)
  //  shareRedirect - base URL to redirect to on share (optional)
  //  toysEl - toys select element (optional)
  //  enableHistory - enable using HTML5 history API (optional)
  function playground(opts) {
    //var code = $(opts.codeEl);
    var runFunc = connectPlayground();
    var stopFunc;
    document.onkeydown = keyHandler;
    function keyHandler(e) {
      if (e.keyCode == 13) { // enter
        if (e.shiftKey) { // +shift
          run();
          e.preventDefault();
          return false;
        } else {
          autoindent(e.target);
        }
      }
      return true;
    }
    //code.unbind('keydown').bind('keydown', keyHandler);  
    var outdiv = $(opts.outputEl).empty();
    var output = $('<pre/>').appendTo(outdiv);
 
    function body() {
      return code.getValue();
    }
    function setBody(text) {
      code.setValue(text);
    }
    function origin(href) {
      return (""+href).split("/").slice(0, 3).join("/");
    }
  
    var pushedEmpty = (window.location.pathname == "/");
    function inputChanged() {
      if (pushedEmpty) {
        return;
      }
      pushedEmpty = true;
      $(opts.shareURLEl).hide();
      window.history.pushState(null, "", "/");
    }
    function popState(e) {
      if (e === null) {
        return;
      }
      if (e && e.state && e.state.code) {
        setBody(e.state.code);
      }
    }
    var rewriteHistory = false;
    if (window.history && window.history.pushState && window.addEventListener && opts.enableHistory) {
      rewriteHistory = true;
      //code.addEventListener('input', inputChanged);
      window.addEventListener('popstate', popState);
    }

    function setError(error) {
      if (stopFunc) stopFunc();
      highlightErrors(error);
      output.empty().addClass("error").text(error);
    }
    function loading() {
      if (stopFunc) stopFunc();
      output.removeClass("error").text('Waiting for remote server...');
    }
    function run() {
      loading();
      stopFunc = runFunc(body(), output);
    }
    function fmt() {
      loading();
      $.ajax("/fmt", {
        data: {"body": body()},
        type: "POST",
        dataType: "json",
        success: function(data) {
          if (data.Error) {
            setError(data.Error);
          } else {
            setBody(data.Body);
            setError("");
          }
        }
      });
    }

    $(opts.runEl).click(run);
    $(opts.fmtEl).click(fmt);
  
    if (opts.shareEl !== null && (opts.shareURLEl !== null || opts.shareRedirect !== null)) {
      var shareURL;
      if (opts.shareURLEl) {
        shareURL = $(opts.shareURLEl).hide();
      }
      var sharing = false;
      $(opts.shareEl).click(function() {
        if (sharing) return;
        sharing = true;
        var sharingData = body();
        $.ajax("/share", {
          processData: false,
          data: sharingData,
          type: "POST",
          complete: function(xhr) {
            sharing = false;
            if (xhr.status != 200) {
              alert("Server error; try again.");
              return;
            }
            if (opts.shareRedirect) {
              window.location = opts.shareRedirect + xhr.responseText;
            }
            if (shareURL) {
              var path = "/p/" + xhr.responseText;
              var url = origin(window.location) + path;
              shareURL.show().val(url).focus().select();
  
              if (rewriteHistory) {
                var historyData = {"code": sharingData};
                window.history.pushState(historyData, "", path);
                pushedEmpty = false;
              }
            }
          }
        });
      });
    }
  
    if (opts.toysEl !== null) {
      $(opts.toysEl).bind('change', function() {
        var toy = $(this).val();
        $.ajax("/doc/play/"+toy, {
          processData: false,
          type: "GET",
          complete: function(xhr) {
            if (xhr.status != 200) {
              alert("Server error; try again.");
              return;
            }
            setBody(xhr.responseText);
          }
        });
      });
    }
  }

  window.connectPlayground = connectPlayground;
  window.playground = playground;

})();
