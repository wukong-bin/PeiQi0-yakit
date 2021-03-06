import React, {useEffect, useState} from "react";
import {Button, PageHeader, Popconfirm, Space, Spin, Tabs, Tag} from "antd";
import {XTerm} from "xterm-for-react";
import {YakEditor} from "../../utils/editors";

const {ipcRenderer} = window.require("electron");

export const ShellItem = (props) => {
    const [haveConnIn, setHaveConnIn] = useState(false);
    const [local, setLocal] = useState("");
    const [remote, setRemote] = useState("");
    const {removeListenPort, addr} = props;
    const xtermRef = React.useRef(null);
    const write = (s) => {
        if (!xtermRef || !xtermRef.current) {
            return
        }

        xtermRef.current.terminal.write(s);
        ipcRenderer.invoke("listening-port-input", props.addr, s)
    };

    useEffect(() => {
        const key = `client-listening-port-data-${props.addr}`
        ipcRenderer.on(key, (e, data) => {
            if (data.control) {
                return
            }

            if (data.localAddr) {
                setLocal(data.localAddr)
            }
            if (data.remoteAddr) {
                setRemote(data.remoteAddr)
            }

            if (data?.raw && xtermRef?.current && xtermRef.current?.terminal) {
                // let str = String.fromCharCode.apply(null, data.raw);
                xtermRef.current.terminal.write(data.raw);
                setHaveConnIn(true)
            }
        });
        return () => {
            ipcRenderer.removeAllListeners(key)
        }
    }, [])

    return <div>
        <PageHeader
            title={"正在监听端口: " + addr}
            subTitle={<Space>
                {local && remote ? <Tag color={"geekblue"}>本地端口:{local} &lt;== 远程端口:{remote}</Tag> :
                    <Tag color={"green"}>
                        等待 TCP 连接接入
                    </Tag>}
            </Space>}
            extra={<Popconfirm title={"确定关闭该端口吗？"} onConfirm={() => {
                removeListenPort(addr)
            }}>
                <Button danger={true} type={"primary"}>强制断开端口</Button>
            </Popconfirm>}
        />
        <Spin spinning={!haveConnIn} tip={"正在等待 TCP 连接连入..."}>
            <XTerm ref={xtermRef} options={{convertEol: true}}
                   onKey={({key, event}) => {
                       const code = key.charCodeAt(0);
                       if (code === 127 && xtermRef?.current) {   //Backspace
                           xtermRef.current.terminal.write("\x1b[D \x1b[D");
                       }

                       write(key)
                   }}/>
        </Spin>
    </div>
};