#include <algorithm>
#include <iostream>
#include <queue>
#include <tuple>
#include <vector>
using namespace std;

using Edge = tuple<int, int, int>;  // (w, u, v)
const char* names = "ABCDEF";

struct DSU {
    vector<int> p;

    DSU(int n) : p(n) {
        for (int i = 0; i < n; ++i) p[i] = i;
    }

    int find(int x) {
        if (p[x] != x) p[x] = find(p[x]);  // 路徑壓縮
        return p[x];
    }

    bool unite(int a, int b) {
        int ra = find(a);
        int rb = find(b);

        if (ra == rb) return false;  // 同一集合，會形成環

        if (ra > rb) swap(ra, rb);   // 編號較小的根當老大
        p[rb] = ra;
        return true;
    }
};

void printEdge(int u, int v, int w) {
    cout << names[u] << '-' << names[v] << '(' << w << ')';
}

void printParent(const vector<int>& p) {
    cout << "p[] = [";
    for (int i = 0; i < (int)p.size(); ++i) {
        if (i) cout << ", ";
        cout << p[i];
    }
    cout << "]\n";
}

void kruskal(int n, vector<Edge> edges, bool showParent) {
    sort(edges.begin(), edges.end());  // tuple 依序比較 w、u、v
    DSU dsu(n);
    vector<Edge> chosen;
    int total = 0;

    cout << "Kruskal:\n";
    for (auto [w, u, v] : edges) {
        bool joined = dsu.unite(u, v);

        cout << "  ";
        printEdge(u, v, w);
        if (joined) {
            cout << " 收下";
            chosen.emplace_back(w, u, v);
            total += w;
        } else {
            cout << " 跳過（成環）";
        }
        cout << '\n';

        if (showParent) printParent(dsu.p);

        // 連通圖已有 n-1 條邊，就完成生成樹。
        if ((int)chosen.size() == n - 1) break;
    }

    cout << "  收邊順序：";
    for (int i = 0; i < (int)chosen.size(); ++i) {
        if (i) cout << ", ";
        auto [w, u, v] = chosen[i];
        printEdge(u, v, w);
    }
    cout << "\n  總重：" << total << '\n';
    if ((int)chosen.size() < n - 1)
        cout << "  這是最小生成森林；圖不連通，無法得到一棵生成樹。\n";
}

void prim(int n, const vector<Edge>& edges) {
    vector<vector<pair<int, int>>> graph(n);
    for (auto [w, u, v] : edges) {
        graph[u].push_back({v, w});
        graph[v].push_back({u, w});
    }

    // tuple 是 (w, v, from)，greater 讓最小的先出來。
    priority_queue<
        tuple<int, int, int>,
        vector<tuple<int, int, int>>,
        greater<tuple<int, int, int>>
    > pq;

    vector<bool> inTree(n, false);
    vector<Edge> chosen;
    int total = 0;

    inTree[0] = true;  // 從 A 開始
    for (auto [v, w] : graph[0]) pq.emplace(w, v, 0);

    cout << "Prim:\n";
    while (!pq.empty() && (int)chosen.size() < n - 1) {
        auto [w, v, from] = pq.top();
        pq.pop();

        if (inTree[v]) continue;  // v 已在樹裡，這張舊票丟掉

        inTree[v] = true;
        chosen.emplace_back(w, from, v);
        total += w;

        for (auto [next, nextW] : graph[v]) {
            if (!inTree[next]) pq.emplace(nextW, next, v);
        }
    }

    cout << "  收邊順序：";
    for (int i = 0; i < (int)chosen.size(); ++i) {
        if (i) cout << ", ";
        auto [w, u, v] = chosen[i];
        printEdge(u, v, w);
    }
    cout << "\n  總重：" << total << '\n';
}

int main() {
    vector<Edge> edges = {
        {4, 0, 1}, {2, 0, 2}, {1, 1, 2}, {5, 1, 3}, {8, 2, 3},
        {10, 2, 4}, {2, 3, 4}, {6, 3, 5}, {3, 4, 5}
    };

    cout << "=== 原圖 ===\n";
    kruskal(6, edges, true);
    prim(6, edges);

    // 測試不連通圖：ABC 與 DEF 之間沒有邊。
    vector<Edge> disconnected = {
        {4, 0, 1}, {2, 0, 2}, {1, 1, 2}, {2, 3, 4}, {3, 4, 5}
    };

    cout << "\n=== 不連通圖 ===\n";
    kruskal(6, disconnected, true);
}
