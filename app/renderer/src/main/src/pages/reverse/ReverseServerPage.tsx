import React, {useEffect, useState} from "react";
import {Alert, Button, Card, Divider, Form, PageHeader, Row, Space, Tag, Typography} from "antd";
import {CopyableField, InputItem, SwitchItem} from "../../utils/inputUtil";
import {StartFacadeServerForm, StartFacadeServerParams} from "./StartFacadeServerForm";
import {randomString} from "../../utils/randomUtil";
import {info} from "../../utils/notification";
import {ExecResultLog} from "../invoker/batch/ExecMessageViewer";
import {ExecResult} from "../invoker/schema";
import {ExtractExecResultMessage} from "../../components/yakitLogSchema";
import {useGetState, useMemoizedFn} from "ahooks";
import {ReverseNotificationTable} from "./ReverseNotificationTable";
import {AutoSpin} from "../../components/AutoSpin";
import {getValue, saveValue} from "../../utils/kv";

export interface ReverseServerPageProp {

}

export interface ReverseNotification {
    uuid: string
    type: string,
    remote_addr: string
    raw?: Uint8Array
    token?: string
    timestamp?: number
}

const {ipcRenderer} = window.require("electron");

const {Text} = Typography;

const BRIDGE_ADDR = "yak-bridge-addr";
const BRIDGE_SECRET = "yak-bridge-secret";

export const ReverseServerPage: React.FC<ReverseServerPageProp> = (props) => {
    const [bridge, setBridge] = useState(false);
    const [bridgeLoading, setBridgeLoading] = useState(false);
    const [bridgeIP, setBridgeIP] = useState<string>("");
    const [bridgeAddr, setBridgeAddr] = useState("");
    const [bridgeSecret, setBridgeSecret] = useState("");


    const [params, setParams] = useState<StartFacadeServerParams>({
        ConnectParam: {
            Addr: "", Secret: "",
        },
        DNSLogLocalPort: 53,
        DNSLogRemotePort: 0,
        EnableDNSLogServer: false,
        ExternalDomain: "",
        FacadeRemotePort: 0,
        LocalFacadeHost: "0.0.0.0",
        LocalFacadePort: 4434,
        Verify: false
    });
    const [token, _] = useState(randomString(40));
    const [loading, setLoading] = useState(false);
    const [logs, setLogs, getLogs] = useGetState<ReverseNotification[]>([]);
    const [reverseToken, setReverseToken] = useState(randomString(20));


    useEffect(() => {
        const messages: ReverseNotification[] = [];
        ipcRenderer.on(`${token}-data`, (_, data: ExecResult) => {
            if (!data.IsMessage) {
                return
            }
            try {
                const message = ExtractExecResultMessage(data) as ExecResultLog;
                const obj = JSON.parse(message.data) as ReverseNotification;
                obj.timestamp = message.timestamp;
                messages.unshift(obj)
                if (messages.length > 100) {
                    messages.pop()
                }
            } catch (e) {

            }

        })
        ipcRenderer.on(`${token}-error`, (data: any) => {
        })
        ipcRenderer.on(`${token}-end`, () => {
            setLoading(false)
        })

        const id = setInterval(() => {
            if (getLogs().length !== messages.length || getLogs().length === 0) {
                setLogs([...messages])
                return
            }

            if (messages.length <= 0) {
                return
            }

            if (messages.length > 0) {
                if (messages[0].uuid !== getLogs()[0].uuid) {
                    setLogs([...messages])
                }
            }
        }, 500)
        return () => {
            clearInterval(id)
            ipcRenderer.removeAllListeners(`${token}-end`);
            ipcRenderer.removeAllListeners(`${token}-error`);
            ipcRenderer.removeAllListeners(`${token}-data`);
        }
    }, [token])

    const connectBridge = useMemoizedFn(() => {
        setBridgeLoading(true)
        ipcRenderer.invoke("GetTunnelServerExternalIP", {
            Addr: bridgeAddr, Secret: bridgeSecret,
        }).then((data: { IP: string }) => {
            saveValue(BRIDGE_ADDR, bridgeAddr)
            saveValue(BRIDGE_SECRET, bridgeSecret)
            setBridgeIP(data.IP)
        }).finally(() => {
            setBridgeLoading(false)
        })
    });

    // ?????? Bridge
    useEffect(() => {
        if (!bridgeAddr) {
            getValue(BRIDGE_ADDR).then((data: string) => {
                if (!!data) {
                    setBridgeAddr(`${data}`)
                }
            })
        }

        if (!bridgeSecret) {
            getValue(BRIDGE_SECRET).then((data: string) => {
                if (!!data) {
                    setBridgeSecret(`${data}`)
                }
            })
        }
    }, [])


    useEffect(() => {
        setBridgeLoading(true)
        setTimeout(() => {
            connectBridge()
        }, 500)
    }, [])

    useEffect(() => {
        if (!!bridgeIP) {
            setBridge(false)
            setParams({...params, ConnectParam: {Addr: bridgeAddr, Secret: bridgeSecret}})
        }
    }, [bridgeIP])

    return <div>
        <PageHeader
            title={"???????????????"}
            subTitle={<Space>
                {bridgeIP ? <Tag
                    onClose={() => {
                        setBridge(true)
                        setBridgeIP("")
                    }}
                    closable={true}
                    color={"green"}>?????? <Text strong={true} style={{color: "#229900"}} copyable={true}
                >{bridgeIP}</Text></Tag> : <Form onSubmitCapture={e => e.preventDefault()}>
                    <SwitchItem label={"??????????????????"} value={bridge} setValue={setBridge} formItemStyle={{marginBottom: 0}}/>
                </Form>}
                ?????????????????????????????????????????????????????????????????? HTTP / RMI / HTTPS ??????????????????
            </Space>}
            extra={<>
                <Space>
                    {loading && <Button
                        danger={true} type={"primary"}
                        onClick={() => {
                            ipcRenderer.invoke("cancel-StartFacades", token)
                        }}
                    >????????????</Button>}
                </Space>
            </>}
        >
            {bridge && <Card title={"????????????"} size={"small"}>
                <AutoSpin spinning={bridgeLoading}>
                    <Space direction={"vertical"}>
                        <Alert type={"success"} message={<Space>
                            <div>
                                ??????????????????????????? yak ????????????????????? <Text code={true} copyable={true}>yak bridge --secret
                                [your-pass]</Text> ??????
                                Yak Bridge ???????????? <Divider type={"vertical"}/> <Text style={{color: "#999"}}>yak
                                version {`>=`} v1.0.11-sp9</Text>
                            </div>
                        </Space>}/>
                        <Form onSubmitCapture={e => {
                            e.preventDefault()

                            connectBridge()
                        }} layout={"inline"}>
                            <InputItem label={"?????? Bridge ??????"} value={bridgeAddr} setValue={setBridgeAddr}/>
                            <InputItem label={"??????"} type={"password"} value={bridgeSecret} setValue={setBridgeSecret}/>
                            <Form.Item colon={false} label={" "}>
                                <Button type="primary" htmlType="submit"> ????????????????????? </Button>
                            </Form.Item>
                        </Form>
                    </Space>
                </AutoSpin>
            </Card>}
            {loading && <Alert
                type={"info"}
                message={<Space direction={"vertical"}>
                    <Space>
                        ?????? RMI ?????? <CopyableField
                        text={`rmi://${bridgeIP && params.ConnectParam?.Addr ? bridgeIP : "127.0.0.1"}:${params.LocalFacadePort}/${reverseToken}`}/>
                    </Space>
                    <Space>
                        ?????? HTTP ?????? <CopyableField
                        text={`http:/${bridgeIP && params.ConnectParam?.Addr ? bridgeIP : "127.0.0.1"}:${params.LocalFacadePort}/${reverseToken}`}/>
                    </Space>
                    <Space>
                        ?????? HTTPS ?????? <CopyableField
                        text={`https://${bridgeIP && params.ConnectParam?.Addr ? bridgeIP : "127.0.0.1"}:${params.LocalFacadePort}/${reverseToken}`}/>
                    </Space>
                </Space>}>
            </Alert>}
        </PageHeader>
        <Row>
            <div style={{width: "100%"}}>
                {loading ? <>
                    <ReverseNotificationTable loading={loading} logs={logs}/>
                </> : <StartFacadeServerForm
                    params={params} setParams={setParams}
                    remoteMode={!!bridgeIP}
                    onSubmit={() => {
                        ipcRenderer.invoke("StartFacades", params, token).then(() => {
                            info("???????????????????????????")
                            setLoading(true)
                        })
                    }}/>}
            </div>
        </Row>
    </div>
};