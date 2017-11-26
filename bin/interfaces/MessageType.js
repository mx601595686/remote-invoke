"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 传输消息的类型
 */
var MessageType;
(function (MessageType) {
    /**
     * 调用远端公开的方法。
     */
    MessageType[MessageType["invoke"] = 0] = "invoke";
    /**
     * 被调用者处理完请求，将结果返回给调用者
     */
    MessageType[MessageType["invokeCallback"] = 1] = "invokeCallback";
    /**
     * 对外发出广播
     */
    MessageType[MessageType["broadcast"] = 2] = "broadcast";
    /**
     * 请求对方打开某一频段的广播
     */
    MessageType[MessageType["requestBroadCast"] = 3] = "requestBroadCast";
    /**
     * 当打开某一广播频段后回应请求者
     */
    MessageType[MessageType["requestBroadCastCallback"] = 4] = "requestBroadCastCallback";
    /**
     * 请求对方关闭某一频段的广播
     */
    MessageType[MessageType["cancelBroadCast"] = 5] = "cancelBroadCast";
    /**
     * 当关闭某一广播频段后回应请求者
     */
    MessageType[MessageType["cancelBroadCastCallback"] = 6] = "cancelBroadCastCallback";
    /**
     * 请求对方发送文件片段
     */
    MessageType[MessageType["requestFilePiece"] = 7] = "requestFilePiece";
    /**
     * 响应发送文件片段请求
     */
    MessageType[MessageType["requestFilePieceCallback"] = 8] = "requestFilePieceCallback";
})(MessageType = exports.MessageType || (exports.MessageType = {}));

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImludGVyZmFjZXMvTWVzc2FnZVR5cGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQTs7R0FFRztBQUNILElBQVksV0E2Q1g7QUE3Q0QsV0FBWSxXQUFXO0lBQ25COztPQUVHO0lBQ0gsaURBQU0sQ0FBQTtJQUVOOztPQUVHO0lBQ0gsaUVBQWMsQ0FBQTtJQUVkOztPQUVHO0lBQ0gsdURBQVMsQ0FBQTtJQUVUOztPQUVHO0lBQ0gscUVBQWdCLENBQUE7SUFFaEI7O09BRUc7SUFDSCxxRkFBd0IsQ0FBQTtJQUV4Qjs7T0FFRztJQUNILG1FQUFlLENBQUE7SUFFZjs7T0FFRztJQUNILG1GQUF1QixDQUFBO0lBRXZCOztPQUVHO0lBQ0gscUVBQWdCLENBQUE7SUFFaEI7O09BRUc7SUFDSCxxRkFBd0IsQ0FBQTtBQUM1QixDQUFDLEVBN0NXLFdBQVcsR0FBWCxtQkFBVyxLQUFYLG1CQUFXLFFBNkN0QiIsImZpbGUiOiJpbnRlcmZhY2VzL01lc3NhZ2VUeXBlLmpzIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXHJcbiAqIOS8oOi+k+a2iOaBr+eahOexu+Wei1xyXG4gKi9cclxuZXhwb3J0IGVudW0gTWVzc2FnZVR5cGUge1xyXG4gICAgLyoqXHJcbiAgICAgKiDosIPnlKjov5znq6/lhazlvIDnmoTmlrnms5XjgIJcclxuICAgICAqL1xyXG4gICAgaW52b2tlLFxyXG5cclxuICAgIC8qKlxyXG4gICAgICog6KKr6LCD55So6ICF5aSE55CG5a6M6K+35rGC77yM5bCG57uT5p6c6L+U5Zue57uZ6LCD55So6ICFXHJcbiAgICAgKi9cclxuICAgIGludm9rZUNhbGxiYWNrLFxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5a+55aSW5Y+R5Ye65bm/5pKtXHJcbiAgICAgKi9cclxuICAgIGJyb2FkY2FzdCxcclxuXHJcbiAgICAvKipcclxuICAgICAqIOivt+axguWvueaWueaJk+W8gOafkOS4gOmikeauteeahOW5v+aSrVxyXG4gICAgICovXHJcbiAgICByZXF1ZXN0QnJvYWRDYXN0LFxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5b2T5omT5byA5p+Q5LiA5bm/5pKt6aKR5q615ZCO5Zue5bqU6K+35rGC6ICFXHJcbiAgICAgKi9cclxuICAgIHJlcXVlc3RCcm9hZENhc3RDYWxsYmFjayxcclxuXHJcbiAgICAvKipcclxuICAgICAqIOivt+axguWvueaWueWFs+mXreafkOS4gOmikeauteeahOW5v+aSrVxyXG4gICAgICovXHJcbiAgICBjYW5jZWxCcm9hZENhc3QsXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDlvZPlhbPpl63mn5DkuIDlub/mkq3popHmrrXlkI7lm57lupTor7fmsYLogIVcclxuICAgICAqL1xyXG4gICAgY2FuY2VsQnJvYWRDYXN0Q2FsbGJhY2ssXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDor7fmsYLlr7nmlrnlj5HpgIHmlofku7bniYfmrrVcclxuICAgICAqL1xyXG4gICAgcmVxdWVzdEZpbGVQaWVjZSxcclxuXHJcbiAgICAvKipcclxuICAgICAqIOWTjeW6lOWPkemAgeaWh+S7tueJh+auteivt+axglxyXG4gICAgICovXHJcbiAgICByZXF1ZXN0RmlsZVBpZWNlQ2FsbGJhY2tcclxufSJdfQ==
