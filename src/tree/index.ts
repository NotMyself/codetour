import { reaction } from "mobx";
import {
  Disposable,
  Event,
  EventEmitter,
  TreeDataProvider,
  TreeItem,
  window
} from "vscode";
import { EXTENSION_NAME } from "../constants";
import { store } from "../store";
import { getTourTitle } from "../utils";
import { CodeTourNode, CodeTourStepNode } from "./nodes";

class CodeTourTreeProvider implements TreeDataProvider<TreeItem>, Disposable {
  private _disposables: Disposable[] = [];

  private _onDidChangeTreeData = new EventEmitter<TreeItem | undefined>();
  public readonly onDidChangeTreeData: Event<TreeItem | undefined> = this
    ._onDidChangeTreeData.event;

  constructor(private extensionPath: string) {
    reaction(
      () => [
        store.tours,
        store.hasTours,
        store.isRecording,
        store.activeTour
          ? [
              store.activeTour.tour.title,
              store.activeTour.tour.description,
              store.activeTour.tour.steps.map(step => [
                step.title,
                step.description
              ])
            ]
          : null
      ],
      () => {
        this._onDidChangeTreeData.fire(undefined);
      }
    );
  }

  getTreeItem = (node: TreeItem) => node;

  async getChildren(element?: TreeItem): Promise<TreeItem[] | undefined> {
    if (!element) {
      if (!store.hasTours && !store.activeTour) {
        return undefined;
      } else {
        const tours = store.tours.map(
          tour => new CodeTourNode(tour, this.extensionPath)
        );

        if (
          store.activeTour &&
          !store.tours.find(tour => tour.id === store.activeTour?.tour.id)
        ) {
          tours.unshift(
            new CodeTourNode(store.activeTour.tour, this.extensionPath)
          );
        }

        return tours;
      }
    } else if (element instanceof CodeTourNode) {
      if (element.tour.steps.length === 0) {
        let item;

        if (store.isRecording && store.activeTour?.tour.id == element.tour.id) {
          item = new TreeItem("Add tour step...");
          item.command = {
            command: "codetour.addContentStep",
            title: "Add tour step..."
          };
        } else {
          item = new TreeItem("No steps recorded");
        }

        return [item];
      } else {
        return element.tour.steps.map(
          (_, index) => new CodeTourStepNode(element.tour, index)
        );
      }
    }
  }

  async getParent(element: TreeItem): Promise<TreeItem | null> {
    if (element instanceof CodeTourStepNode) {
      return new CodeTourNode(element.tour, this.extensionPath);
    } else {
      return null;
    }
  }

  dispose() {
    this._disposables.forEach(disposable => disposable.dispose());
  }
}

export function registerTreeProvider(extensionPath: string) {
  const treeDataProvider = new CodeTourTreeProvider(extensionPath);
  const treeView = window.createTreeView(`${EXTENSION_NAME}.tours`, {
    showCollapseAll: true,
    treeDataProvider,
    canSelectMany: true
  });

  let isRevealPending = false;
  treeView.onDidChangeVisibility(e => {
    if (e.visible && isRevealPending) {
      isRevealPending = false;
      revealCurrentStepNode();
    }
  });

  function revealCurrentStepNode() {
    setTimeout(() => {
      treeView.reveal(
        new CodeTourStepNode(store.activeTour!.tour, store.activeTour!.step)
      );
    }, 300);
  }

  reaction(
    () => [
      store.activeTour
        ? [
            store.activeTour.tour.title,
            store.activeTour.tour.steps.map(step => [step.title]),
            store.activeTour.step
          ]
        : null
    ],
    () => {
      if (store.activeTour && store.activeTour.step >= 0) {
        if (
          !treeView.visible ||
          store.activeTour.tour.steps[store.activeTour.step].view
        ) {
          isRevealPending = true;
          return;
        }

        const title = getTourTitle(store.activeTour.tour);
        treeView.message = `Current step: #${store.activeTour.step + 1} of ${
          store.activeTour.tour.steps.length
        } (${title})`;

        revealCurrentStepNode();
      } else {
        // TODO: Once VS Code supports it, we want
        // to de-select the step node once the tour ends.
        treeView.message = undefined;
      }
    }
  );
}
