"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ethers } from "ethers";

declare global {
  interface Window { ethereum?: any; relayerSDK?: any }
}

export default function Dashboard() {
  const [account, setAccount] = useState<string>("");
  const [chainId, setChainId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState("dashboard");

  // 合约与解密相关状态
  const VITALCHAIN_ADDRESS = process.env.NEXT_PUBLIC_VITALCHAIN_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  const COUNT_ABI = [
    { inputs: [], name: "myEncryptedCount", outputs: [{ internalType: "euint32", name: "", type: "bytes32" }], stateMutability: "view", type: "function" },
    { inputs: [], name: "myEncryptedLastVolume", outputs: [{ internalType: "euint32", name: "", type: "bytes32" }], stateMutability: "view", type: "function" }
  ];
  const EVENT_ABI = [
    {
      anonymous: false,
      inputs: [
        { indexed: true, internalType: "address", name: "user", type: "address" },
        { indexed: false, internalType: "string", name: "ipfsCid", type: "string" },
        { indexed: false, internalType: "uint64", name: "date", type: "uint64" },
        { indexed: false, internalType: "bytes32", name: "locationHash", type: "bytes32" },
        { indexed: false, internalType: "bytes32", name: "hospitalHash", type: "bytes32" },
        { indexed: false, internalType: "uint8", name: "donationCategory", type: "uint8" },
        { indexed: false, internalType: "uint32", name: "transparentVolume", type: "uint32" },
        { indexed: false, internalType: "euint32", name: "encVolume", type: "bytes32" }
      ],
      name: "VitalRecordLogged",
      type: "event"
    }
  ];

  const [countHandle, setCountHandle] = useState<string | null>(null);
  const [clearCount, setClearCount] = useState<number | null>(null);
  const [lastValue, setLastValue] = useState<number | null>(null);
  const [msg, setMsg] = useState<string>("");
  const [recentRecords, setRecentRecords] = useState<Array<{date:number; ipfsCid:string; category:number}>>([]);

  useEffect(() => {
    if (!window.ethereum) return;
    const p = new ethers.BrowserProvider(window.ethereum);
    p.send("eth_chainId", []).then((hex: string) => setChainId(parseInt(hex, 16))).catch(() => {});
    p.send("eth_accounts", []).then(async (accs: string[]) => {
      if (accs?.length) {
        const s = await p.getSigner();
        setAccount(await s.getAddress());
      }
    }).catch(() => {});
  }, []);

  const connect = async () => {
    if (!window.ethereum) return;
    const p = new ethers.BrowserProvider(window.ethereum);
    await p.send("eth_requestAccounts", []);
    const s = await p.getSigner();
    setAccount(await s.getAddress());
    const net = await s.provider.getNetwork();
    setChainId(Number(net.chainId));
  };

  const decryptMyStats = async () => {
    if (!account || !chainId) return;
    try {
      setMsg("🔐 正在读取密文句柄...");
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const c = new ethers.Contract(VITALCHAIN_ADDRESS, COUNT_ABI, signer);
      const handle: string = await c.myEncryptedCount();
      setCountHandle(handle);

      // 选择本地 mock 或 Sepolia relayer
      let instance: any;
      if (chainId === 31337) {
        const { MockFhevmInstance } = await import("@fhevm/mock-utils");
        const p = new ethers.JsonRpcProvider("http://localhost:8545");
        let md: any = null; try { md = await p.send("fhevm_relayer_metadata", []);} catch {}
        instance = await (MockFhevmInstance as any).create(p, p, {
          aclContractAddress: md?.ACLAddress ?? "0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D",
          inputVerifierContractAddress: md?.InputVerifierAddress ?? "0x901F8942346f7AB3a01F6D7613119Bca447Bb030",
          kmsContractAddress: md?.KMSVerifierAddress ?? "0x1364cBBf2cDF5032C47d8226a6f6FBD2AFCDacAC",
          chainId: 31337,
          gatewayChainId: 55815,
          verifyingContractAddressDecryption: "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64",
          verifyingContractAddressInputVerification: "0x812b06e1CDCE800494b79fFE4f925A504a9A9810",
        });
      } else {
        const win = window as any;
        if (!win.relayerSDK) {
          await new Promise<void>((resolve, reject) => {
            const s = document.createElement("script");
            s.src = "https://cdn.zama.ai/relayer-sdk-js/0.2.0/relayer-sdk-js.umd.cjs";
            s.async = true; s.onload = () => resolve(); s.onerror = () => reject(new Error("SDK load failed")); document.head.appendChild(s);
          });
        }
        await (window as any).relayerSDK.initSDK();
        instance = await (window as any).relayerSDK.createInstance({ ...(window as any).relayerSDK.SepoliaConfig, network: (window as any).ethereum });
      }

      setMsg("🔓 正在解密...");
      const { publicKey, privateKey } = instance.generateKeypair();
      const start = Math.floor(Date.now() / 1000);
      const days = 365;
      const eip712 = instance.createEIP712(publicKey, [VITALCHAIN_ADDRESS], start, days);
      const signature = await (await provider.getSigner() as any).signTypedData(
        eip712.domain, { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification }, eip712.message
      );
      const userAddr = await (await provider.getSigner()).getAddress();
      const res = await instance.userDecrypt(
        [{ handle, contractAddress: VITALCHAIN_ADDRESS }],
        privateKey, publicKey, signature,
        [VITALCHAIN_ADDRESS], userAddr, start, days
      );
      const clear = Number(res[handle]);
      setClearCount(clear);
      setMsg("✅ 解密完成");

      // 继续解密最近一次指标
      try {
        const lastHandle: string = await c.myEncryptedLastVolume();
        const res2 = await instance.userDecrypt(
          [{ handle: lastHandle, contractAddress: VITALCHAIN_ADDRESS }],
          privateKey, publicKey, signature,
          [VITALCHAIN_ADDRESS], userAddr, start, days
        );
        setLastValue(Number(res2[lastHandle]));
      } catch {}

      // 读取最近事件
      await fetchRecentRecords();
    } catch (e: any) {
      setMsg(`❌ 解密失败: ${e?.message || e}`);
    }
  };

  const fetchRecentRecords = async () => {
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const iface = new ethers.Interface(EVENT_ABI as any);
      const topic0 = iface.getEvent("VitalRecordLogged").topicHash;
      const userTopic = ethers.zeroPadValue(account as string, 32);
      const current = await provider.getBlockNumber();
      const logs = await provider.getLogs({
        address: VITALCHAIN_ADDRESS,
        topics: [topic0, userTopic],
        fromBlock: current > 5000 ? current - 5000 : 0,
        toBlock: "latest"
      });
      const parsed = logs.slice(-5).reverse().map(l => {
        const ev = iface.decodeEventLog("VitalRecordLogged", l.data, l.topics);
        return { date: Number(ev[2]), ipfsCid: String(ev[1]), category: Number(ev[5]) };
      });
      setRecentRecords(parsed);
    } catch {}
  };

  return (
    <div className="layout">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <div className="logo-icon">🔬</div>
            <div className="logo-text">VitalChain</div>
          </div>
        </div>
        
        <nav className="nav-menu">
          <Link href="/" className={`nav-item ${currentPage === 'dashboard' ? 'active' : ''}`}>
            📊 仪表板
          </Link>
          <Link href="/submit" className="nav-item">
            ➕ 新建记录
          </Link>
          <Link href="/badges" className="nav-item">
            🏆 成就徽章
          </Link>
          <div className="nav-item" style={{marginTop: 'auto', borderTop: '1px solid var(--light-gray)', paddingTop: '1rem'}}>
            💡 隐私计算
          </div>
        </nav>
      </div>

      {/* Main Content */}
      <div className="main-content">
        <div className="dashboard-header">
          <div>
            <h1 className="page-title">健康数据仪表板</h1>
            <p style={{color: '#6c757d', marginTop: '0.5rem'}}>
              基于 FHEVM 的零知识健康记录管理平台
            </p>
          </div>
          <div className="wallet-status">
            <div className={`status-badge ${account ? 'status-connected' : 'status-disconnected'}`}>
              {chainId === 31337 ? '🔗 本地网络' : chainId === 11155111 ? '🌐 Sepolia' : '❌ 未连接'}
            </div>
            {account ? (
              <div className="status-badge status-connected">
                {account.slice(0,6)}...{account.slice(-4)}
              </div>
            ) : (
              <button className="btn-gradient btn-primary" onClick={connect}>
                连接钱包
              </button>
            )}
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-icon">🩺</div>
            <div className="metric-value">{clearCount ?? 0}</div>
            <div className="metric-label">总记录数</div>
          </div>
          
          <div className="metric-card">
            <div className="metric-icon">🔐</div>
            <div className="metric-value">100%</div>
            <div className="metric-label">数据加密率</div>
          </div>
          
          <div className="metric-card">
            <div className="metric-icon">⚡</div>
            <div className="metric-value">{chainId === 31337 ? '活跃' : '离线'}</div>
            <div className="metric-label">网络状态</div>
          </div>
        </div>

        {/* Action Cards */}
        <div className="metrics-grid">
          <div className="metric-card" style={{cursor: 'pointer'}}>
            <div className="metric-icon">📝</div>
            <h3 style={{marginBottom: '1rem', color: 'var(--dark-gray)'}}>创建新记录</h3>
            <p style={{color: '#6c757d', marginBottom: '1.5rem'}}>
              添加新的健康数据记录，自动加密存储
            </p>
            <Link href="/submit" className="btn-gradient btn-primary">
              立即创建
            </Link>
          </div>
          
          <div className="metric-card" style={{cursor: 'pointer'}}>
            <div className="metric-icon">🏅</div>
            <h3 style={{marginBottom: '1rem', color: 'var(--dark-gray)'}}>查看成就</h3>
            <p style={{color: '#6c757d', marginBottom: '1.5rem'}}>
              根据记录次数解锁专属成就徽章
            </p>
            <Link href="/badges" className="btn-gradient btn-secondary">
              查看徽章
            </Link>
          </div>
        </div>

        {account && (
          <div className="metrics-grid">
            <div className="metric-card" style={{textAlign:'left'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <h3 style={{margin:0,color:'var(--text-primary)'}}>解密我的数据</h3>
                <button className="btn-gradient btn-primary" onClick={decryptMyStats}>读取并解密</button>
              </div>
              <div style={{marginTop:'1rem',color:'var(--text-secondary)'}}>
                {msg || '点击按钮以解密累计次数与最近一次指标'}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:'1rem',marginTop:'1rem'}}>
                <div className="stat"><span>累计次数</span><span>{clearCount ?? '-'}</span></div>
                <div className="stat"><span>最近指标</span><span>{lastValue ?? '-'}</span></div>
              </div>
            </div>

            <div className="metric-card" style={{textAlign:'left'}}>
              <h3 style={{marginTop:0,color:'var(--text-primary)'}}>最近记录</h3>
              {recentRecords.length === 0 ? (
                <div style={{color:'var(--text-secondary)'}}>暂无记录，先到“新建记录”提交吧。</div>
              ) : (
                <div style={{display:'grid',gap:'0.75rem'}}>
                  {recentRecords.map((r, idx) => (
                    <div key={idx} className="stat" style={{display:'flex',justifyContent:'space-between'}}>
                      <span>{new Date(r.date * 1000).toLocaleDateString()}</span>
                      <span style={{color:'var(--text-secondary)'}}>🗂 {r.ipfsCid.slice(0,8)}... · 类别 {r.category}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {!account && (
          <div className="form-container" style={{textAlign: 'center'}}>
            <div style={{fontSize: '4rem', marginBottom: '1rem'}}>🔐</div>
            <h2 style={{marginBottom: '1rem', color: 'var(--dark-gray)'}}>连接钱包开始使用</h2>
            <p style={{color: '#6c757d', marginBottom: '2rem'}}>
              请连接您的 MetaMask 钱包以访问加密健康记录系统
            </p>
            <button className="btn-gradient btn-primary" onClick={connect}>
              连接 MetaMask 钱包
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


