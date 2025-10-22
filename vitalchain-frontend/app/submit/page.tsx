"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ethers } from "ethers";

const VITALCHAIN_ADDRESS = process.env.NEXT_PUBLIC_VITALCHAIN_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const VITALCHAIN_ABI = [
  {
    inputs: [
      { internalType: "externalEuint32", name: "inputVolume", type: "bytes32" },
      { internalType: "bytes", name: "inputProof", type: "bytes" },
      { internalType: "string", name: "ipfsCid", type: "string" },
      { internalType: "uint64", name: "date", type: "uint64" },
      { internalType: "bytes32", name: "locationHash", type: "bytes32" },
      { internalType: "bytes32", name: "hospitalHash", type: "bytes32" },
      { internalType: "uint8", name: "donationCategory", type: "uint8" },
      { internalType: "uint32", name: "transparentVolume", type: "uint32" }
    ],
    name: "logVitalRecord",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
];

export default function CreateRecord() {
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [account, setAccount] = useState<string>("");
  const [chainId, setChainId] = useState<number | null>(null);
  const [date, setDate] = useState<string>("");
  const [checkupType, setCheckupType] = useState<string>("");
  const [facility, setFacility] = useState<string>("");
  const [category, setCategory] = useState<number>(0);
  const [indicator, setIndicator] = useState<number>(120);
  const [message, setMessage] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!window.ethereum) return;
    const p = new ethers.BrowserProvider(window.ethereum);
    setProvider(p);
    p.send("eth_chainId", []).then((hex: string) => setChainId(parseInt(hex, 16))).catch(() => {});
    p.send("eth_accounts", []).then(async (accs: string[]) => {
      if (accs?.length) { const s = await p.getSigner(); setSigner(s); setAccount(await s.getAddress()); }
    }).catch(() => {});
  }, []);

  const connect = async () => {
    if (!provider) return;
    await provider.send("eth_requestAccounts", []);
    const s = await provider.getSigner();
    setSigner(s); setAccount(await s.getAddress());
    const id = await s.provider.getNetwork(); setChainId(Number(id.chainId));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!provider || !signer || !account) return;
    
    setIsSubmitting(true);
    try {
      setMessage("🔐 正在初始化零知识加密系统...");
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
            const s = document.createElement("script"); s.src = "https://cdn.zama.ai/relayer-sdk-js/0.2.0/relayer-sdk-js.umd.cjs"; s.onload = () => resolve(); s.onerror = () => reject(new Error("SDK load failed")); document.head.appendChild(s);
          });
        }
        await (window as any).relayerSDK.initSDK();
        instance = await (window as any).relayerSDK.createInstance({ ...(window as any).relayerSDK.SepoliaConfig, network: (window as any).ethereum });
      }

      setMessage("🧮 正在对敏感数据进行同态加密...");
      const buffer = instance.createEncryptedInput(VITALCHAIN_ADDRESS, account);
      buffer.add32(BigInt(indicator));
      const enc = await buffer.encrypt();

      const typeHash = ethers.keccak256(ethers.toUtf8Bytes(checkupType + account));
      const facilityHash = ethers.keccak256(ethers.toUtf8Bytes(facility + account));

      setMessage("⛓️ 正在提交到区块链网络...");
      const c = new ethers.Contract(VITALCHAIN_ADDRESS, VITALCHAIN_ABI, signer);
      const tx = await c.logVitalRecord(
        enc.handles[0], enc.inputProof, "ipfs://health-record", Math.floor(new Date(date).getTime()/1000),
        typeHash, facilityHash, category, 0,
        { gasLimit: 10000000 }
      );
      
      setMessage("⏳ 等待区块确认...");
      await tx.wait();
      setMessage("✅ 体检记录已成功加密存储到区块链！");
      
      // Reset form
      setDate("");
      setCheckupType("");
      setFacility("");
      setIndicator(120);
    } catch (e: any) {
      setMessage(`❌ 操作失败: ${e?.message || e}`);
    } finally {
      setIsSubmitting(false);
    }
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
          <Link href="/" className="nav-item">
            📊 仪表板
          </Link>
          <Link href="/submit" className="nav-item active">
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
            <h1 className="page-title">新建体检记录</h1>
            <p style={{color: '#6c757d', marginTop: '0.5rem'}}>
              添加加密体检数据，全程隐私保护
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

        {account ? (
          <div className="form-container">
            <div style={{textAlign: 'center', marginBottom: '2rem'}}>
              <div style={{fontSize: '3rem', marginBottom: '1rem'}}>🔐</div>
              <h2 style={{color: 'var(--dark-gray)', marginBottom: '0.5rem'}}>零知识体检数据</h2>
              <p style={{color: '#6c757d'}}>数据将通过 FHEVM 同态加密，确保完全隐私</p>
            </div>

            <form onSubmit={onSubmit}>
              <div className="form-group">
                <label className="form-label">📅 检查日期</label>
                <input 
                  className="form-input" 
                  type="date" 
                  value={date} 
                  onChange={e => setDate(e.target.value)} 
                  required 
                />
              </div>

              <div className="form-group">
                <label className="form-label">🔬 检查项目</label>
                <input 
                  className="form-input" 
                  type="text"
                  value={checkupType} 
                  onChange={e => setCheckupType(e.target.value)} 
                  placeholder="例如：血压监测、心电图检查"
                  required 
                />
              </div>

              <div className="form-group">
                <label className="form-label">🏥 检查机构</label>
                <input 
                  className="form-input" 
                  type="text"
                  value={facility} 
                  onChange={e => setFacility(e.target.value)} 
                  placeholder="例如：协和医院体检中心"
                  required 
                />
              </div>

              <div className="form-group">
                <label className="form-label">📊 健康分类</label>
                <select 
                  className="form-input" 
                  value={category} 
                  onChange={e => setCategory(Number(e.target.value))}
                >
                  <option value={0}>常规体检</option>
                  <option value={1}>专项检查</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">💓 健康指标数值</label>
                <input 
                  className="form-input" 
                  type="number" 
                  value={indicator} 
                  onChange={e => setIndicator(Number(e.target.value))} 
                  min={50} 
                  max={200} 
                  step={5}
                  required 
                />
                <small style={{color: '#6c757d', fontSize: '0.875rem'}}>
                  此数值将被完全加密，只有您可以解密查看
                </small>
              </div>

              <button 
                className="btn-gradient btn-primary" 
                type="submit" 
                disabled={isSubmitting}
                style={{width: '100%', fontSize: '1.125rem', padding: '1rem'}}
              >
                {isSubmitting ? '🔄 处理中...' : '🚀 提交体检数据'}
              </button>
            </form>

            {message && (
              <div className="message-box">
                {message}
              </div>
            )}
          </div>
        ) : (
          <div className="form-container" style={{textAlign: 'center'}}>
            <div style={{fontSize: '4rem', marginBottom: '1rem'}}>🔗</div>
            <h2 style={{marginBottom: '1rem', color: 'var(--dark-gray)'}}>请先连接钱包</h2>
            <p style={{color: '#6c757d', marginBottom: '2rem'}}>
              需要连接 MetaMask 钱包才能创建加密体检记录
            </p>
            <button className="btn-gradient btn-primary" onClick={connect}>
              连接 MetaMask
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


