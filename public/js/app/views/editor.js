define(function (require, exports, module) {
    "use strict";

    var Backbone = require("backbone"),
        _ = require("underscore"),
        $ = require("jquery"),
        Dropzone = require("dropzone");

    var animate = require("utils/animate"),
        debug = require("utils/debug")(module.id),
        notify = require("utils/notify"),
        path = require("utils/path"),
        shell = require("utils/shell");

    var editorElementId = "editor";

    module.exports = Backbone.View.extend({
        tagName: "pre",

        initialize: function () {
            this.$el.attr("id", this.elementId);

            this.listenTo(this.model, "change:filePath", this.loadFile);
            this.listenTo(this.model, "change:fileExt", this.setSyntaxMode);
            
            this.uploadDropzone = new Dropzone(this.el, {
                url: "/upload"
            });
        },

        events: {
            // "drop": function (event) {
            //     var files = event.originalEvent.dataTransfer.files;
            //     debugger;
                
            // }
        },

        isCursorChangeHandlerActive: true,
        disableCursorChangeHandler: function () {
            this.isCursorChangeHandlerActive = false;
        },
        enableCursorChangeHandler: function () {
            this.isCursorChangeHandlerActive = true;
        },
        
        loadFile: function () {
            var filePath = this.model.get("filePath"),
                _this = this;
            
            if (!filePath) {
                notify.error("No file to show!");
                this.changeContent(this.helpContent);
                this.model.set("fileExt", this.defaultFileExt);
                return;
            }
            var fileExt = path.extname(filePath) || this.defaultFileExt;
            this.model.set("fileExt", fileExt);

            debug("Fetching file: " + filePath);
            var model = this.model;
            shell.openFile(filePath, function (res) {
                debug("File data successfully fetched!");
                _this.changeContent(res);
            }, function (err) {
                notify.error(err.responseText);
            }, this);
        },

        setSyntaxMode: function () {
            var fileExt = this.model.get("fileExt"),
                syntaxMode = this.modes[fileExt] || fileExt;

            debug("Setting syntax mode to: " + syntaxMode);
            this.aceEditor && this.aceEditor.getSession().setMode("ace/mode/" + syntaxMode);
        },

        changeContent: function (content) {
            var contentArea = this.contentAreaCss ? this.$el.find(this.contentAreaCss) : this.$el,
                editor = this.aceEditor,
                _this = this;

            if (content !== editor.getValue()) {
                debug("Changing content to length: " + content.length);
                animate.slideOutIn(
                    contentArea,
                    function () {
                        _this.disableCursorChangeHandler();

                        editor.setValue(content);
                        editor.clearSelection();

                        var editorSession = editor.getSession();
                        editorSession.setScrollTop(0);
                        editor.moveCursorToPosition(_this.getLastCursorPosition());

                        _this.enableCursorChangeHandler();

                        // model.saveUndoManagerHistory(editorSession.)
                        editorSession.setUndoManager(new window.ace.UndoManager());
                    },
                    "left",
                    function () {
                        _this.$el.find("textarea").focus();
                    }
                );
            }
        },

        lastPositionKey: function (filePath) {
            if (!filePath) {
                return "";
            }
            return this.lastPositionPrefix + filePath;
        },

        getLastCursorPosition: function () {
            var filePath = this.model.get("filePath"),
                lastPosition = window.localStorage.getItem(this.lastPositionKey(filePath));
            
            if (!lastPosition) {
                return {row: 0, column: 0};
            }

            debug("Got last cursor position for this file: " + lastPosition);
            return JSON.parse(lastPosition);
        },

        setLastCursorPosition: _.throttle(function () {
            var cursorPosition = this.aceEditor.getCursorPosition(),
                filePath = this.model.get("filePath"),
                lastPosition;
            try {
                lastPosition = JSON.stringify(cursorPosition);
            } catch (e) {
                debug("Could not serialize current cursor position.", cursorPosition);
                return false;
            }
            window.localStorage.setItem(this.lastPositionKey(filePath), lastPosition);
            return true;
        }, 1000),

        setTheme: function (themeName) {
            themeName = themeName || this.defaultTheme;

            debug("Setting theme to: " + themeName);
            this.aceEditor.setTheme("ace/theme/" + themeName);
        },

        initializeAceEditor: function () {
            var _this = this;
            _.defer(function () {
                debug("Initializing Ace editor on div: #" + _this.elementId);
                _this.$el.hide();
                _this.aceEditor = window.editor = window.ace.edit(_this.elementId); // using window.ace here is a hack

                if (_this.model.get("filePath")) {
                    _this.loadFile();
                } else {
                    _this.aceEditor.setValue(_this.helpContent);
                }
                
                _this.aceEditor.clearSelection();
                _this.aceEditor.gotoLine(1);
                _this.setTheme();
                _this.aceEditor.getSession().selection.on("changeCursor", function (e) {
                    if (_this.isCursorChangeHandlerActive) {
                        _this.setLastCursorPosition();
                    }
                });
                _this.aceEditor.commands.addCommand({
                    name: "saveFile",
                    bindKey: { win: 'Ctrl-S',  mac: 'Command-S' },
                    exec: function(editor) {
                        var filePath = _this.model.get("filePath"),
                            contents = _this.aceEditor.getValue();
                            
                        shell.saveFile(filePath, contents, function (res){
                            debug("File saved: " + filePath);
                            animate.saveSuccessful(_this.$el);
                        }, function (err) {
                            notify.error(err.responseText);
                            animate.saveFailure(_this.$el);
                        }, this);
                    },
                    readOnly: true // false if this command should not apply in readOnly mode
                });

                _this.$el.fadeIn();
                _this.trigger("initialized");
            });
        },

        render: function () {
            if (!this.aceEditor) {
                this.initializeAceEditor();
            }
            return this;
        },

        modes: {
            "js": "javascript",
            "md": "markdown",
            "cs": "csharp"
        },

        fileExtRegExp: /\.[^.]+$/,
        defaultFileExt: "text",
        defaultTheme: "solarized_light",
        elementId: editorElementId,
        contentAreaCss: null,
        lastPositionPrefix: "lastPosition-",
        helpContent: "Enter a folder path in the input box →"
    });
});