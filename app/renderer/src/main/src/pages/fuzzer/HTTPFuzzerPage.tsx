import React, {useEffect, useState} from "react"
import {
    Button,
    Card,
    Col,
    Divider,
    Form,
    Input,
    Modal,
    notification,
    Result,
    Row,
    Space,
    Spin,
    Tag,
    Typography,
    Dropdown, Menu,
} from "antd"
import {HTTPPacketEditor, IMonacoEditor} from "../../utils/editors"
import {showDrawer, showModal} from "../../utils/showModal"
import {fuzzerTemplates} from "./fuzzerTemplates"
import {StringFuzzer} from "./StringFuzzer"
import {InputFloat, InputInteger, InputItem, ManyMultiSelectForString, OneLine, SwitchItem} from "../../utils/inputUtil"
import {fixEncoding} from "../../utils/convertor"
import {FuzzerResponseToHTTPFlowDetail} from "../../components/HTTPFlowDetail"
import {randomString} from "../../utils/randomUtil"
import {
    ColumnWidthOutlined,
    DeleteOutlined,
    ProfileOutlined,
    LeftOutlined,
    RightOutlined,
    DownOutlined
} from "@ant-design/icons";
import {HTTPFuzzerResultsCard} from "./HTTPFuzzerResultsCard";


const {ipcRenderer} = window.require("electron");

export const analyzeFuzzerResponse = (i: FuzzerResponse, setRequest: (r: string) => any) => {
    let m = showDrawer({
        width: "90%",
        content: (
            <>
                <FuzzerResponseToHTTPFlowDetail
                    response={i}
                    sendToWebFuzzer={(isHttps, request) => {
                        setRequest(request)
                        m.destroy()
                    }}
                    onClosed={() => {
                        m.destroy()
                    }}
                />
            </>
        )
    })
}

export interface HTTPFuzzerPageProp {
    isHttps?: boolean
    request?: string
}

const {Text} = Typography

export interface FuzzerResponse {
    Method: string
    StatusCode: number
    Host: string
    ContentType: string
    Headers: { Header: string; Value: string }[]
    ResponseRaw: Uint8Array
    RequestRaw: Uint8Array
    BodyLength: number
    UUID: string
    Timestamp: number
    DurationMs: number

    Ok: boolean
    Reason: string
}

const defaultPostTemplate = `POST / HTTP/1.1
Content-Type: application/json
Host: www.example.com

{"key": "value"}`

export const HTTPFuzzerPage: React.FC<HTTPFuzzerPageProp> = (props) => {
    // params
    const [isHttps, setIsHttps] = useState(props.isHttps || false)
    const [request, setRequest] = useState(props.request || defaultPostTemplate)
    const [concurrent, setConcurrent] = useState(20)
    const [forceFuzz, setForceFuzz] = useState(true)
    const [timeout, setTimeout] = useState(5.0)
    const [proxy, setProxy] = useState("")
    const [actualHost, setActualHost] = useState("")
    const [advancedConfig, setAdvancedConfig] = useState(false);

    // state
    const [loading, setLoading] = useState(false)
    const [content, setContent] = useState<FuzzerResponse[]>([])
    const [reqEditor, setReqEditor] = useState<IMonacoEditor>()
    const [fuzzToken, setFuzzToken] = useState("")
    const [search, setSearch] = useState("")

    const [viewMode, setViewMode] = useState<"split" | "request" | "result">("split");
    const [refreshTrigger, setRefreshTrigger] = useState(false);
    const refreshRequest = () => {
        setRefreshTrigger(!refreshTrigger);
    }

    // history
    const [history, setHistory] = useState<string[]>([]);
    const [currentHistoryIndex, setCurrentHistoryIndex] = useState<number>();

    const withdrawRequest = () => {
        const targetIndex = history.indexOf(request) - 1;
        if (targetIndex >= 0) {
            setRequest(history[targetIndex]);
            setCurrentHistoryIndex(targetIndex);
        }
    }
    const forwardRequest = () => {
        const targetIndex = history.indexOf(request) + 1;
        if (targetIndex < history.length) {
            setCurrentHistoryIndex(targetIndex);
            setRequest(history[targetIndex]);
        }
    };

    useEffect(() => {
        if (currentHistoryIndex === undefined) {
            return
        }
        refreshRequest()
    }, [currentHistoryIndex])

    useEffect(() => {
        setIsHttps(!!props.isHttps)
        if (props.request) {
            setRequest(props.request)
            setContent([])
        }
    }, [props.isHttps, props.request])

    const submitToHTTPFuzzer = () => {
        setLoading(true)
        if (history.includes(request)) {
            history.splice(history.indexOf(request), 1)
        }
        history.push(request)
        setHistory([...history])

        ipcRenderer.invoke(
            "HTTPFuzzer",
            {
                Request: request,
                ForceFuzz: forceFuzz,
                IsHTTPS: isHttps,
                Concurrent: concurrent,
                PerRequestTimeoutSeconds: timeout,
                Proxy: proxy, ActualAddr: actualHost,
            },
            fuzzToken
        )
    }

    const cancelCurrentHTTPFuzzer = () => {
        ipcRenderer.invoke("cancel-HTTPFuzzer", fuzzToken)
    }

    useEffect(() => {
        const token = randomString(60)
        setFuzzToken(token)

        const dataToken = `${token}-data`
        const errToken = `${token}-error`
        const endToken = `${token}-end`

        ipcRenderer.on(errToken, (e, details) => {
            notification["error"]({
                message: `?????????????????????????????? ${details}`,
                placement: "bottomRight"
            })
        })
        let buffer: FuzzerResponse[] = []
        const updateData = () => {
            if (buffer.length <= 0) {
                return
            }
            setContent([...buffer])
        }
        ipcRenderer.on(dataToken, (e: any, data: any) => {
            const response = new Buffer(data.ResponseRaw).toString(
                fixEncoding(data.GuessResponseEncoding)
            )
            buffer.push({
                StatusCode: data.StatusCode,
                Ok: data.Ok,
                Reason: data.Reason,
                Method: data.Method,
                Host: data.Host,
                ContentType: data.ContentType,
                Headers: (data.Headers || []).map((i: any) => {
                    return {Header: i.Header, Value: i.Value}
                }),
                DurationMs: data.DurationMs,
                BodyLength: data.BodyLength,
                UUID: data.UUID,
                Timestamp: data.Timestamp,
                ResponseRaw: data.ResponseRaw,
                RequestRaw: data.RequestRaw
            } as FuzzerResponse)
            // setContent([...buffer])
        })
        ipcRenderer.on(endToken, () => {
            updateData()
            buffer = []
            setLoading(false)
        })

        const updateDataId = setInterval(() => {
            updateData()
        }, 1000)

        return () => {
            ipcRenderer.invoke("cancel-HTTPFuzzer", token)

            clearInterval(updateDataId)
            ipcRenderer.removeAllListeners(errToken)
            ipcRenderer.removeAllListeners(dataToken)
            ipcRenderer.removeAllListeners(endToken)
        }
    }, [])

    const onlyOneResponse = !loading && (content || []).length === 1;

    const filtredResponses =
        search === ""
            ? content || []
            : (content || []).filter((i) => {
                return Buffer.from(i.ResponseRaw).toString().includes(search)
            })
    const successResults = filtredResponses.filter((i) => i.Ok)
    const failedResults = filtredResponses.filter((i) => !i.Ok)


    const getLeftSpan = () => {
        switch (viewMode) {
            case "request":
                return 18;
            case "result":
                return 6;
            case "split":
            default:
                return 12
        }
    };

    return (
        <div style={{height: "100%", width: "100%", display: "flex", flexDirection: "column", overflow: "hidden"}}>
            <Row gutter={8}>
                <Col span={12} style={{textAlign: "left"}}>
                    <Space>
                        {loading ? (
                            <Button
                                style={{width: 150}}
                                onClick={() => {
                                    cancelCurrentHTTPFuzzer()
                                }}
                                // size={"small"}
                                danger={true}
                                type={"primary"}
                            >
                                ????????????
                            </Button>
                        ) : (
                            <Button
                                style={{width: 150}}
                                onClick={() => {
                                    setContent([])
                                    submitToHTTPFuzzer()
                                }}
                                // size={"small"}
                                type={"primary"}
                            >
                                ???????????????
                            </Button>
                        )}
                        <Space>
                            <Button
                                onClick={() => {
                                    withdrawRequest()
                                }}
                                type={"link"}
                                icon={<LeftOutlined/>}
                            />
                            <Button
                                onClick={() => {
                                    forwardRequest()
                                }}
                                type={"link"} icon={<RightOutlined/>}
                            />
                            {history.length > 1 && <Dropdown trigger={["click"]} overlay={() => {
                                return <Menu>
                                    {history.map((i, index) => {
                                        return <Menu.Item
                                            style={{width: 120}}
                                            onClick={() => {
                                                setRequest(i)
                                                setCurrentHistoryIndex(index)
                                            }}
                                        >{`${index}`}</Menu.Item>
                                    })}
                                </Menu>
                            }}>
                                <Button size={"small"} type={"link"} onClick={e => e.preventDefault()}>
                                    History <DownOutlined/>
                                </Button>
                            </Dropdown>}
                        </Space>
                        <SwitchItem
                            label={"????????????"} formItemStyle={{marginBottom: 0}}
                            value={advancedConfig} setValue={setAdvancedConfig}
                            size={"small"}
                        />
                        {loading && <Space>
                            <Spin size={"small"}/>
                            <div style={{color: "#3a8be3"}}>
                                sending packets
                            </div>
                        </Space>}
                        {isHttps && <Tag>?????? HTTPS</Tag>}
                        {proxy && <Tag>?????????{proxy}</Tag>}
                        {/*<Popover*/}
                        {/*    trigger={"click"}*/}
                        {/*    content={*/}
                        {/*    }*/}
                        {/*>*/}
                        {/*    <Button type={"link"} size={"small"}>*/}
                        {/*        ???????????????*/}
                        {/*    </Button>*/}
                        {/*</Popover>*/}
                        {actualHost !== "" && <Tag color={"red"}>?????? Host:{actualHost}</Tag>}
                    </Space>
                </Col>
                <Col span={12} style={{textAlign: "left"}}>
                </Col>
            </Row>

            {advancedConfig && <Row style={{marginTop: 8}} gutter={8}>
                <Col span={16}>
                    {/*????????????*/}
                    <Card bordered={true} size={"small"} bodyStyle={{height: 106}}>
                        <Spin style={{width: "100%"}} spinning={!reqEditor}>
                            <Form
                                onSubmitCapture={(e) => e.preventDefault()}
                                // layout={"horizontal"}
                                size={"small"}
                                // labelCol={{span: 8}}
                                // wrapperCol={{span: 16}}
                            >
                                <Row gutter={8}>
                                    <Col span={12} xl={8}>
                                        <Form.Item
                                            label={<OneLine width={68}>
                                                Intruder
                                            </OneLine>}
                                            style={{marginBottom: 4}}
                                        >
                                            <Button
                                                style={{backgroundColor: "#08a701"}}
                                                size={"small"}
                                                type={"primary"}
                                                onClick={() => {
                                                    const m = showModal({
                                                        width: "70%",
                                                        content: (
                                                            <>
                                                                <StringFuzzer
                                                                    advanced={true}
                                                                    disableBasicMode={true}
                                                                    insertCallback={(
                                                                        template: string
                                                                    ) => {
                                                                        if (!template) {
                                                                            Modal.warn({
                                                                                title: "Payload ?????? / Fuzz ????????????"
                                                                            })
                                                                        } else {
                                                                            if (
                                                                                reqEditor &&
                                                                                template
                                                                            ) {
                                                                                reqEditor.trigger(
                                                                                    "keyboard",
                                                                                    "type",
                                                                                    {
                                                                                        text: template
                                                                                    }
                                                                                )
                                                                            } else {
                                                                                Modal.error(
                                                                                    {
                                                                                        title: "BUG: ???????????????"
                                                                                    }
                                                                                )
                                                                            }
                                                                            m.destroy()
                                                                        }
                                                                    }}
                                                                />
                                                            </>
                                                        )
                                                    })
                                                }}
                                            >
                                                ?????? yak.fuzz ??????
                                            </Button>
                                        </Form.Item>
                                    </Col>
                                    <Col span={12} xl={8}>
                                        <SwitchItem
                                            label={<OneLine width={68}>?????? fuzz</OneLine>}
                                            setValue={(e) => {
                                                if (!e) {
                                                    Modal.confirm({
                                                        title: "???????????? Fuzz ???????????????????????????????????? Fuzz ??????????????????",
                                                        onOk: () => {
                                                            setForceFuzz(e)
                                                        }
                                                    })
                                                    return
                                                }
                                                setForceFuzz(e)
                                            }}
                                            size={"small"}
                                            value={forceFuzz}
                                            formItemStyle={{marginBottom: 4}}
                                        />
                                    </Col>
                                    <Col span={12} xl={8}>
                                        <InputInteger
                                            label={<OneLine width={68}>????????????</OneLine>}
                                            size={"small"}
                                            setValue={(e) => {
                                                setConcurrent(e)
                                            }}
                                            formItemStyle={{marginBottom: 4}} // width={40}
                                            width={50}
                                            value={concurrent}
                                        />
                                    </Col>
                                    <Col span={12} xl={8}>
                                        <SwitchItem
                                            label={<OneLine width={68}>HTTPS</OneLine>}
                                            setValue={(e) => {
                                                setIsHttps(e)
                                            }}
                                            size={"small"}
                                            value={isHttps}
                                            formItemStyle={{marginBottom: 4}}
                                        />
                                    </Col>
                                    <Col span={12} xl={8}>
                                        <ManyMultiSelectForString
                                            formItemStyle={{marginBottom: 4}}
                                            label={<OneLine width={68}>????????????</OneLine>}
                                            data={[
                                                "http://127.0.0.1:7890",
                                                "http://127.0.0.1:8080",
                                                "http://127.0.0.1:8082"
                                            ].map((i) => {
                                                return {label: i, value: i}
                                            })}
                                            mode={"tags"}
                                            defaultSep={","}
                                            value={proxy}
                                            setValue={(r) => {
                                                setProxy(r.split(",").join(","))
                                            }}
                                        />
                                    </Col>
                                    <Col span={12} xl={8}>
                                        <InputItem
                                            extraFormItemProps={{
                                                style: {marginBottom: 0}
                                            }}
                                            label={<OneLine width={68}>?????? Host</OneLine>}
                                            setValue={setActualHost}
                                            value={actualHost}
                                        />
                                    </Col>
                                    <Col span={12} xl={8}>
                                        <InputFloat
                                            formItemStyle={{marginBottom: 4}}
                                            size={"small"}
                                            label={<OneLine width={68}>????????????</OneLine>}
                                            setValue={setTimeout}
                                            value={timeout}
                                        />
                                    </Col>
                                </Row>
                            </Form>
                        </Spin>
                    </Card>
                </Col>
                <Col span={8}>
                    <Card bordered={true} size={"small"} bodyStyle={{height: 106}}>
                        <div style={{marginTop: 30, textAlign: "center"}}>
                            <p style={{color: "#888"}}>??????????????????????????????????????????</p>
                        </div>
                    </Card>
                </Col>
            </Row>}
            <Divider style={{marginTop: 12, marginBottom: 4}}/>
            <Row style={{flex: "1"}} gutter={5}>
                <Col span={getLeftSpan()}>
                    <HTTPPacketEditor
                        simpleMode={viewMode === "result"}
                        refreshTrigger={refreshTrigger}
                        hideSearch={true} bordered={true}
                        originValue={new Buffer(request)}
                        onEditor={setReqEditor}
                        onChange={(i) => setRequest(new Buffer(i).toString("utf8"))}
                        extra={<Space>
                            <Button
                                size={"small"}
                                type={viewMode === "request" ? "primary" : "link"}
                                icon={<ColumnWidthOutlined/>}
                                onClick={() => {
                                    if (viewMode === "request") {
                                        setViewMode("split")
                                    } else {
                                        setViewMode("request")
                                    }
                                }}
                            />
                        </Space>}
                    />
                </Col>
                <Col span={24 - getLeftSpan()}>
                    {onlyOneResponse ? (
                        <>
                            <HTTPPacketEditor
                                simpleMode={viewMode === "request"}
                                originValue={content[0].ResponseRaw}
                                bordered={true} hideSearch={true}
                                emptyOr={!content[0].Ok && (
                                    <Result
                                        status={"error"} title={"????????????"}
                                        // no such host
                                        subTitle={(() => {
                                            const reason = content[0]!.Reason;
                                            if (reason.includes("tcp: i/o timeout")) {
                                                return "????????????"
                                            }
                                            if (reason.includes("no such host")) {
                                                return "DNS ?????????????????????"
                                            }
                                            return undefined
                                        })()}
                                    >
                                        <>???????????????{content[0].Reason}</>
                                    </Result>
                                )}
                                readOnly={true} extra={
                                viewMode === "request" ? <Button
                                        size={"small"}
                                        type={"link"}
                                        icon={<ColumnWidthOutlined/>}
                                        onClick={() => {
                                            setViewMode("result")
                                        }}
                                    /> :
                                    <Space>
                                        {loading && <Spin size={"small"} spinning={loading}/>}
                                        {onlyOneResponse
                                            ?
                                            <Space>
                                                <Tag>{content[0].DurationMs}ms</Tag>
                                                <Space key='single'>
                                                    <Button
                                                        size={"small"}
                                                        onClick={() => {
                                                            analyzeFuzzerResponse(content[0], r => {
                                                                setRequest(r)
                                                                refreshRequest()
                                                            })
                                                        }}
                                                        type={"primary"}
                                                        icon={<ProfileOutlined/>}
                                                    >
                                                        ??????
                                                    </Button>
                                                    <Button
                                                        type={"primary"}
                                                        size={"small"}
                                                        onClick={() => {
                                                            setContent([])
                                                        }}
                                                        danger={true}
                                                        icon={<DeleteOutlined/>}
                                                    >

                                                    </Button>
                                                </Space>
                                            </Space>
                                            :
                                            <Space key='list'>
                                                <Tag color={"green"}>??????:{successResults.length}</Tag>
                                                <Input
                                                    size={"small"}
                                                    value={search}
                                                    onChange={(e) => {
                                                        setSearch(e.target.value)
                                                    }}
                                                />
                                                {/*<Tag>?????????????????????[{(content || []).length}]</Tag>*/}
                                                <Button
                                                    size={"small"}
                                                    onClick={() => {
                                                        setContent([])
                                                    }}
                                                >
                                                    ????????????
                                                </Button>
                                            </Space>
                                        }
                                        <Button
                                            size={"small"}
                                            type={viewMode === "result" ? "primary" : "link"}
                                            icon={<ColumnWidthOutlined/>}
                                            onClick={() => {
                                                if (viewMode === "result") {
                                                    setViewMode("split")
                                                } else {
                                                    setViewMode("result")
                                                }
                                            }}
                                        />
                                    </Space>
                            }
                            />
                            {/*<YakEditor*/}
                            {/*    readOnly={true} bytes={true} valueBytes={content[0].ResponseRaw}*/}
                            {/*/>*/}
                        </>
                    ) : (
                        <>
                            {(content || []).length > 0 ? (
                                <HTTPFuzzerResultsCard
                                    setRequest={r => {
                                        setRequest(r)
                                        refreshRequest()
                                    }}
                                    extra={<Button
                                        size={"small"}
                                        type={viewMode === "result" ? "primary" : "link"}
                                        icon={<ColumnWidthOutlined/>}
                                        onClick={() => {
                                            if (viewMode === "result") {
                                                setViewMode("split")
                                            } else {
                                                setViewMode("result")
                                            }
                                        }}
                                    />}
                                    failedResponses={failedResults}
                                    successResponses={successResults}
                                />
                            ) : (
                                <Result
                                    status={"info"}
                                    title={"????????????????????????????????? HTTP ??????/????????????"}
                                    subTitle={"??????????????????????????????????????? HTTP ?????????????????????????????????????????????????????????/?????????????????????"}
                                />
                            )}
                        </>)}
                </Col>
            </Row>
            {/*<LinerResizeCols*/}
            {/*    style={{flex: "1"}}*/}
            {/*    leftNode={*/}
            {/*        <HTTPPacketEditor*/}
            {/*            refreshTrigger={refreshTrigger}*/}
            {/*            hideSearch={true} bordered={true}*/}
            {/*            originValue={new Buffer(request)}*/}
            {/*            onEditor={setReqEditor}*/}
            {/*            onChange={(i) => setRequest(new Buffer(i).toString("utf8"))}*/}
            {/*        />*/}
            {/*    }*/}
            {/*    rightNode={*/}
            {/*        */}
            {/*    }*/}
            {/*/>*/}
        </div>)
}


