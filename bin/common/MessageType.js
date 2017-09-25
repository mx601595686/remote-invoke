"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 消息的类型
 *
 * @export
 * @enum {number}
 */
var MessageType;
(function (MessageType) {
    /**
     * 调用远端方法
     */
    MessageType[MessageType["invoke"] = 0] = "invoke";
    /**
     * 被调用者处理完请求，将结果返回给调用端
     */
    MessageType[MessageType["replyInvoke"] = 1] = "replyInvoke";
    /**
     * 对外发出广播
     */
    MessageType[MessageType["broadcast"] = 2] = "broadcast";
})(MessageType = exports.MessageType || (exports.MessageType = {}));

//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbW1vbi9NZXNzYWdlVHlwZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBOzs7OztHQUtHO0FBQ0gsSUFBWSxXQWVYO0FBZkQsV0FBWSxXQUFXO0lBQ25COztPQUVHO0lBQ0gsaURBQU0sQ0FBQTtJQUVOOztPQUVHO0lBQ0gsMkRBQVcsQ0FBQTtJQUVYOztPQUVHO0lBQ0gsdURBQVMsQ0FBQTtBQUNiLENBQUMsRUFmVyxXQUFXLEdBQVgsbUJBQVcsS0FBWCxtQkFBVyxRQWV0QiIsImZpbGUiOiJjb21tb24vTWVzc2FnZVR5cGUuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICog5raI5oGv55qE57G75Z6LXHJcbiAqIFxyXG4gKiBAZXhwb3J0XHJcbiAqIEBlbnVtIHtudW1iZXJ9XHJcbiAqL1xyXG5leHBvcnQgZW51bSBNZXNzYWdlVHlwZSB7XHJcbiAgICAvKipcclxuICAgICAqIOiwg+eUqOi/nOerr+aWueazlVxyXG4gICAgICovXHJcbiAgICBpbnZva2UsXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDooqvosIPnlKjogIXlpITnkIblrozor7fmsYLvvIzlsIbnu5Pmnpzov5Tlm57nu5nosIPnlKjnq69cclxuICAgICAqL1xyXG4gICAgcmVwbHlJbnZva2UsXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDlr7nlpJblj5Hlh7rlub/mkq1cclxuICAgICAqL1xyXG4gICAgYnJvYWRjYXN0XHJcbn0iXX0=
