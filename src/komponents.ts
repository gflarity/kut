import { KubeConfig, V1Pod, V1Namespace, V1Node } from '@kubernetes/client-node';
import { EventEmitter } from "events";
import * as vis from "vis"
import { PodWrapper } from "./kubernetes/pod_wrapper"
import { IWatcher } from "./kubernetes/watcher";
import { Tabs } from "./widgets"

export abstract class Komponent extends EventEmitter {}

export class PodView extends Komponent {

    private tabs = new Tabs(this.container)

    constructor(private kubeConfig: KubeConfig, private pod: V1Pod, private container: HTMLDivElement) {
        super()
        const logTab = this.tabs.addTab(`${pod!.metadata!.name} logs`)
        const wrappedProd = new PodWrapper(this.kubeConfig, pod!)
        wrappedProd.followLogs().then((stream) => {
            stream.on("data", (line) => {
                logTab.addText(line + "\n")
            })

            // when the tab goes away the stream should stop writing to it
            logTab.on("destroy", () => {
                stream.destroy()
            })
        }).catch((err) => {
            console.log(err)
        })
    }

    public destroy() {
        this.tabs.destroy()
    }
}

export type Filter<T> = (resource: T) => boolean
export type Indentifer<T> = (resource: T) => string

export class WatcherView<T> extends Komponent {
    private rootColour = "#f7da00"
    private visNetworkNodes: vis.DataSet<vis.Node>  = new vis.DataSet([])
    private visNetworkEdges: vis.DataSet<vis.Edge> = new vis.DataSet([])
    private visNetwork = new vis.Network(this.container, { nodes: this.visNetworkNodes, edges: this.visNetworkEdges}, {
        layout: {
            improvedLayout: true,
        },
    })

    constructor(private container: HTMLDivElement, private centerNodeId: string,
                private watcher: IWatcher<T>, private filter: Filter<T>, private identifier: Indentifer<T>) {
            super()
            this.visNetworkNodes.add({id: centerNodeId, label: centerNodeId, color: this.rootColour })
            this.visNetwork.redraw()

            const resources = Array.from(this.watcher.getCached().values()).filter(filter)
            resources.forEach((resource) => {
                const nodeID = this.identifier(resource) as string
                this.visNetworkNodes.add({ id: nodeID, label: nodeID, shape: "box" })
                this.visNetworkEdges.add({ to: centerNodeId, from: nodeID })
                this.visNetwork.redraw()
            })

            this.visNetwork.on("selectNode", (params) => {
                const selectedNetworkNodeId = this.visNetwork.getNodeAt(params.pointer.DOM) as string
                if (selectedNetworkNodeId === this.centerNodeId) {
                    this.emit("back")
                } else {
                    this.emit("selected", this.watcher.getCached().get(selectedNetworkNodeId))
                }
            })

            this.registerListeners()
    }

    public destroy() {
        this.unregisterListeners()
        this.removeAllListeners()
    }

    private registerListeners() {
        this.watcher.on("ADDED", this.onAdded.bind(this))
        this.watcher.on("MODIFIED", this.onModified.bind(this))
        this.watcher.on("DELETED", this.onDeleted.bind(this))
    }

    private unregisterListeners() {
        this.watcher.removeListener("ADDED", this.onAdded)
        this.watcher.removeListener("MODIFIED", this.onModified)
        this.watcher.removeListener("DELETED", this.onDeleted)
    }

    private onAdded(resource: T) {
        const nodeID = this.identifier(resource) as string
        this.visNetworkNodes.add({ id: nodeID, label: nodeID, shape: "box" })
        this.visNetworkEdges.add({ to: this.centerNodeId, from: nodeID })
        this.visNetwork.redraw()
    }

    private onModified(resource: T) {
        const nodeId = this.identifier(resource)
        // TODO change colours etc
    }

    private onDeleted(resource: T) {
        const nodeId = this.identifier(resource)
        this.visNetworkNodes.remove(nodeId)
        this.visNetworkEdges.remove(nodeId)
        this.visNetwork.redraw()
    }


}