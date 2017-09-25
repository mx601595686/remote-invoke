/**
 * SendingManager的构造函数参数
 * 
 * @export
 * @interface SendingManagerConfig
 */
export interface SendingManagerConfig {

    /**
     * 是否启用将流量平摊到每一个连接端口上，默认true
     * 
     * @type {boolean}
     * @memberof SendingManagerConfig
     */
    loadBalance?: boolean;
}